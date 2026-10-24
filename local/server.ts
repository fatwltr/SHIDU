import {createServer} from 'node:http';
import {createServer as createHttpsServer} from 'node:https';
import {readFileSync} from 'node:fs';
import {createHash,timingSafeEqual} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRss} from '../lib/rss-core';
import {DEFAULT_RSSHUB,normalizeInstance,resolveRoute,validateFeedUrl} from '../lib/rsshub.mjs';
import {openDatabase} from './sqlite';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const port=Number(process.env.RSS_PORT||8787);
const bind=process.env.RSS_BIND||'127.0.0.1';
const publicOrigin=process.env.RSS_PUBLIC_ORIGIN;
const tls=process.env.RSS_TLS_CERT&&process.env.RSS_TLS_KEY?{cert:readFileSync(process.env.RSS_TLS_CERT),key:readFileSync(process.env.RSS_TLS_KEY)}:null;
const authUser=process.env.RSS_AUTH_USER||'reader',authPassword=process.env.RSS_AUTH_PASSWORD;
if(bind!=='127.0.0.1'&&(!publicOrigin||!tls||!authPassword))throw Error('Remote access requires RSS_PUBLIC_ORIGIN, TLS certificate/key and an access password');
const expectedAuth=authPassword?createHash('sha256').update(authUser+':'+authPassword).digest():null;
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('RSS_PORT must be a port from 1024 to 65535');
const data=resolve(process.env.RSS_DATA_DIR||resolve(root,'local-data'));
const {adapter,db}=openDatabase(resolve(data,'rss.sqlite'),resolve(root,'.local/migrations/0000.sql'));
const instance=()=>String((db.prepare("SELECT value FROM settings WHERE key='rsshub_instance'").get() as any)?.value||DEFAULT_RSSHUB);
const rss:ReturnType<typeof createRss>=createRss(()=>adapter,{validateUrl:(raw:string)=>{
 try{return validateFeedUrl(raw,instance(),rss.publicUrl);}catch(error){
  const u=new URL(raw);if(['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&db.prepare('SELECT id FROM feeds WHERE url=?').get(u.href))return u.href;
  throw error;
 }
}});
const publicDir=resolve(root,'.local/public');
const day=(d:string)=>new Date(d).toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'});
let ticking=false;
async function tick(){if(ticking)return;ticking=true;try{const now=new Date();await rss.cleanupReadArticles(now);const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',hourCycle:'h23'}).format(now));const {lastRun}=await rss.state();if(hour>=8&&(!lastRun||day(lastRun.at)!==day(now.toISOString()))){const result=await rss.refreshAll();console.log(new Date().toISOString(),'Daily refresh',JSON.stringify(result));}}catch(e){console.error('Scheduled maintenance failed',e);}finally{ticking=false;}}
const makeServer:typeof createServer=tls?((handler:any)=>createHttpsServer(tls,handler)) as any:createServer;
const server=makeServer(async(req,res)=>{
 const json=(value:unknown,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
 try{
  const host=req.headers.host||'';if(![`127.0.0.1:${port}`,`localhost:${port}`,...(publicOrigin?[new URL(publicOrigin).host]:[])].includes(host))return json({error:'访问地址无效'},403);
  if(expectedAuth){
   const header=req.headers.authorization||'';const credential=header.startsWith('Basic ')?Buffer.from(header.slice(6),'base64').toString('utf8'):'';
   const received=createHash('sha256').update(credential).digest();
   if(!credential||!timingSafeEqual(received,expectedAuth)){res.writeHead(401,{'WWW-Authenticate':'Basic realm="Shidu RSS", charset="UTF-8"','Cache-Control':'no-store'});return res.end('Authentication required');}
  }
  const path=new URL(req.url||'/',`http://${host}`).pathname;
  if(path==='/api/health'&&req.method==='GET')return json({app:'shidu-local',ok:true,port,refreshHour:8,timeZone:'Asia/Shanghai',readRetentionDays:7});
  if(req.method==='GET'&&path==='/api/reader')return json({...await rss.state(),rsshubInstance:instance(),rsshubSupported:true});
  if(req.method==='GET'&&path==='/api/refresh'){const s=await rss.state();return json({lastRun:s.lastRun,feedCount:s.feeds.length,articleCount:s.articles.length});}
  if(req.method==='POST'){
   const expectedOrigin=publicOrigin||`${tls?'https':'http'}://${host}`;
   if(req.headers.origin!==expectedOrigin)return json({error:'请求来源无效'},403);
   if(path==='/api/refresh')return json(await rss.refreshAll());
   if(path!=='/api/reader')return json({error:'接口不存在'},404);
   let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>32768)return json({error:'请求过大'},413);}
   let b:any;try{b=JSON.parse(raw);}catch{return json({error:'无效请求'},400);}
   if(!b||typeof b!=='object')return json({error:'无效请求'},400);
   if(b.action==='rsshubSettings'){
    if(typeof b.instance!=='string'||b.instance.length>2000)throw Error('请输入有效的实例地址');
    const normalized=normalizeInstance(b.instance);const u=new URL(normalized);
    if(['localhost','127.0.0.1','[::1]'].includes(u.hostname)&&Number(u.port||(u.protocol==='https:'?443:80))===port)throw Error('请填写 RSSHub 的端口，不是阅读器地址');
    db.prepare("INSERT INTO settings(key,value) VALUES('rsshub_instance',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(normalized);return json({ok:true,instance:normalized});
   }
   if(b.action==='add'){if(typeof b.url!=='string'||b.url.length>2000)throw Error('请输入有效 RSS 地址');const count=await adapter.prepare('SELECT COUNT(*) AS n FROM feeds').first<{n:number}>();if((count?.n||0)>=30)throw Error('最多添加 30 个源');const feedUrl=b.kind==='rsshub'?resolveRoute(b.url,instance()):b.url;try{await rss.addFeed(feedUrl,String(b.category||'未分类').slice(0,30));}catch(e){if(b.kind==='rsshub')throw Error('RSSHub 订阅失败：'+(e instanceof Error?e.message:'连接异常')+'。请检查实例、路由及该路由所需的登录配置。');throw e;}}
   else if(b.action==='delete'&&typeof b.id==='string')await adapter.batch([adapter.prepare('DELETE FROM articles WHERE feed_id=?').bind(b.id),adapter.prepare('DELETE FROM feeds WHERE id=?').bind(b.id)]);
   else if(b.action==='article'&&typeof b.id==='string'&&['read','saved'].includes(b.field)&&typeof b.value==='boolean'){if(b.field==='read')await rss.setRead(b.id,b.value);else await adapter.prepare('UPDATE articles SET saved=? WHERE id=?').bind(b.value?1:0,b.id).run();}
   else if(b.action==='readAll')await rss.readAll(typeof b.feedId==='string'?b.feedId:undefined);
   else return json({error:'不支持的操作'},400);
   return json({ok:true});
  }
  if(req.method!=='GET'&&req.method!=='HEAD')return json({error:'不支持此请求'},405);
  const file=path==='/'?resolve(publicDir,'index.html'):resolve(publicDir,'.'+decodeURIComponent(path));
  if(!file.startsWith(publicDir+sep))return json({error:'访问被拒绝'},403);
  const content=await readFile(file).catch(()=>null);if(!content)return json({error:'页面不存在'},404);
  const mime:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2'};
  res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':extname(file)==='.html'?'no-cache':'public, max-age=3600'});res.end(req.method==='HEAD'?undefined:content);
 }catch(e){console.error(e);json({error:e instanceof Error?e.message:'操作失败，请稍后重试'},400);}
});
const timer=setInterval(tick,60000);
server.on('error',e=>{clearInterval(timer);console.error(e);process.exit(1);});
server.listen(port,bind,()=>{console.log(`Shidu RSS ${publicOrigin||`http://127.0.0.1:${port}`}/`);console.log(`Database: ${resolve(data,'rss.sqlite')}`);console.log('Daily update: 08:00 Asia/Shanghai; catches up after waking or restarting.');void tick();});
function close(){clearInterval(timer);server.close(()=>{db.close();process.exit(0);});}
process.on('SIGINT',close);process.on('SIGTERM',close);
