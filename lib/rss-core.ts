import {parseFeed} from './feed-parser.mjs';
export function createRss(database:()=>D1Database,options:{validateUrl?:(raw:string)=>string}={}){
const validateUrl=(raw:string)=>options.validateUrl?options.validateUrl(raw):publicUrl(raw);

function publicUrl(raw:string){
 const u=new URL(raw);const h=u.hostname.toLowerCase().replace(/\.$/,'');
 if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.port&&!['80','443'].includes(u.port))throw Error('请使用公开的 HTTP / HTTPS 订阅地址');
 if(!h.includes('.')||/^[\d.]+$/.test(h)||h.includes(':')||h.includes('[')||/(^|\.)(localhost|local|internal|test|invalid|home|lan)$/.test(h)||h.endsWith('.arpa'))throw Error('请使用公开网站的订阅地址');
 return u.href;
}
async function fetchFeed(url:string,etag?:string,modified?:string){
 let target=validateUrl(url);const signal=AbortSignal.timeout(15000);
 for(let i=0;i<5;i++){
  const r=await fetch(target,{redirect:'manual',signal,headers:{'User-Agent':'ShiduRSS/1.0','Accept':'application/rss+xml, application/atom+xml, application/feed+json, application/xml, text/xml',...(etag?{'If-None-Match':etag}:{}),...(modified?{'If-Modified-Since':modified}:{})}});
  if([301,302,303,307,308].includes(r.status)){target=validateUrl(new URL(r.headers.get('location')||'',target).href);continue;}
  if(r.status===304)return {unchanged:true,etag,modified};
  if(!r.ok)throw Error(`订阅源返回 HTTP ${r.status}`);
  if(Number(r.headers.get('content-length'))>2000000)throw Error('订阅源超过 2 MB');
  const reader=r.body?.getReader();if(!reader)throw Error('订阅源为空');let size=0;const chunks:Uint8Array[]=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2000000){await reader.cancel();throw Error('订阅源超过 2 MB');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
  const charset=r.headers.get('content-type')?.match(/charset=["']?([^;"' ]+)/i)?.[1]||'utf-8';let raw:string;try{raw=new TextDecoder(charset).decode(bytes);}catch{raw=new TextDecoder().decode(bytes);}
  return {unchanged:false,feed:parseFeed(raw,target),etag:r.headers.get('etag'),modified:r.headers.get('last-modified')};
 }throw Error('订阅源跳转次数过多');
}
async function digest(s:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(v=>v.toString(16).padStart(2,'0')).join('');}
async function saveItems(id:string,items:any[]){const db=database(),now=new Date().toISOString();const statements=[];for(const i of items){const articleId=await digest(id+':'+i.key);statements.push(db.prepare('INSERT INTO articles(id,feed_id,title,url,summary,published,fetched) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM feeds WHERE id=?) AND NOT EXISTS(SELECT 1 FROM deleted_articles WHERE id=?) ON CONFLICT(id) DO UPDATE SET title=excluded.title, summary=excluded.summary, url=excluded.url').bind(articleId,id,i.title.slice(0,500),i.url,i.summary,i.published,now,id,articleId));}for(let i=0;i<statements.length;i+=40)await db.batch(statements.slice(i,i+40));}
async function setRead(id:string,value:boolean){const db=database();if(value)await db.prepare('UPDATE articles SET read_at=CASE WHEN read=0 OR read_at IS NULL THEN ? ELSE read_at END,read=1 WHERE id=?').bind(new Date().toISOString(),id).run();else await db.prepare('UPDATE articles SET read=0,read_at=NULL WHERE id=?').bind(id).run();}
async function readAll(feedId?:string){const db=database(),sql='UPDATE articles SET read_at=CASE WHEN read=0 OR read_at IS NULL THEN ? ELSE read_at END,read=1';await(feedId===undefined?db.prepare(sql).bind(new Date().toISOString()):db.prepare(sql+' WHERE feed_id=?').bind(new Date().toISOString(),feedId)).run();}
async function cleanupReadArticles(now=new Date()){
 const db=database(),cutoff=new Date(now.getTime()-7*24*60*60*1000).toISOString();
 const eligible='read=1 AND saved=0 AND read_at IS NOT NULL AND read_at<=?';
 await db.batch([
  db.prepare('INSERT INTO deleted_articles(id,feed_id,deleted_at) SELECT id,feed_id,? FROM articles WHERE '+eligible+' ON CONFLICT(id) DO NOTHING').bind(now.toISOString(),cutoff),
  db.prepare('DELETE FROM articles WHERE '+eligible).bind(cutoff),
 ]);
}
async function addFeed(url:string,category:string){const db=database();const clean=validateUrl(url);const existing=await db.prepare('SELECT id FROM feeds WHERE url=?').bind(clean).first();if(existing)throw Error('这个订阅源已经添加过了');const result=await fetchFeed(clean);if(!result.feed)throw Error('订阅源没有内容');const id=crypto.randomUUID(),now=new Date().toISOString();await db.prepare('INSERT INTO feeds(id,url,title,category,site,checked,created,etag,modified) VALUES(?,?,?,?,?,?,?,?,?)').bind(id,clean,result.feed.title,category||'未分类',result.feed.site,now,now,result.etag||null,result.modified||null).run();await saveItems(id,result.feed.items);return id;}
const day=(s:string)=>new Date(s).toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'});
async function refreshAll(){const db=database(),now=new Date().toISOString();const lock=await db.prepare("INSERT INTO settings(key,value) VALUES('refresh_lock',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE CAST(settings.value AS INTEGER) < ? RETURNING value").bind(String(Date.now()+600000),Date.now()).first();if(!lock)return {status:'running',message:'已有更新任务正在运行'};
 try{const {results}=await db.prepare('SELECT * FROM feeds ORDER BY created').all<any>();const report=[];
 for(const f of results){if(f.checked&&day(f.checked)===day(now)){report.push({id:f.id,title:f.title,status:'skipped'});continue;}
 try{const r=await fetchFeed(f.url,f.etag,f.modified);if(r.feed)await saveItems(f.id,r.feed.items);await db.prepare('UPDATE feeds SET checked=?, error=NULL,etag=?,modified=? WHERE id=?').bind(now,r.etag||null,r.modified||null,f.id).run();report.push({id:f.id,title:f.title,status:'ok',items:r.feed?.items.length||0});}
 catch(e){const message=e instanceof Error?e.message:'拉取失败';await db.prepare('UPDATE feeds SET checked=?,error=? WHERE id=?').bind(now,message,f.id).run();report.push({id:f.id,title:f.title,status:'error',error:message});}}
 const result={status:'completed',at:now,feeds:report};await db.prepare("INSERT INTO settings(key,value) VALUES('last_run',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(result)).run();return result;
 }finally{await db.prepare("DELETE FROM settings WHERE key='refresh_lock'").run();}}
async function state(){const db=database();const [feeds,articles,last]=await Promise.all([db.prepare('SELECT * FROM feeds ORDER BY created').all(),db.prepare('SELECT a.*,f.title AS feed_title,f.category FROM articles a JOIN feeds f ON f.id=a.feed_id ORDER BY a.published DESC LIMIT 2000').all(),db.prepare("SELECT value FROM settings WHERE key='last_run'").first<{value:string}>()]);return {feeds:feeds.results,articles:articles.results,lastRun:last?JSON.parse(last.value):null};}

return {database,publicUrl,saveItems,addFeed,refreshAll,state,setRead,readAll,cleanupReadArticles};
}
