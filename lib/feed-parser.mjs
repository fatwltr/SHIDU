// Bounded XML reader; DTDs and external entities are never resolved.
export function decode(s='') { return String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&#(x[\da-f]+|\d+);|&(amp|lt|gt|quot|apos|nbsp);/gi, (m,n,e)=>{if(n){const c=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return c>0&&c<=0x10ffff?String.fromCodePoint(c):'';}return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[e.toLowerCase()]??m;}); }
export function plain(s=''){return decode(String(s).replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();}
export function safeUrl(raw,base){if(!raw)return '';try{const u=new URL(raw,base);return ['http:','https:'].includes(u.protocol)?u.href:'';}catch{return '';}}
function xmlTree(xml){
 if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('不支持含 DTD 或实体声明的订阅源');
 const root={name:'root',children:[],text:'',attrs:{}};const stack=[root];
 const tokens=xml.match(/<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<[^>]+>|[^<]+/g)||[];
 if(tokens.length>160000)throw Error('订阅源内容过于复杂');
 for(const t of tokens){let cur=stack[stack.length-1];if(t.startsWith('<!--')||t.startsWith('<?'))continue;
 if(t.startsWith('<![CDATA[')){cur.text+=t.slice(9,-3);continue;}
 if(t.startsWith('</')){const name=t.match(/^<\/([^\s>]+)/)?.[1]?.toLowerCase();if(stack.length===1||stack[stack.length-1].name!==name)throw Error('订阅源 XML 格式有误');stack.pop();continue;}
 if(t.startsWith('<')){const name=t.match(/^<([^\s/>]+)/)?.[1]?.toLowerCase();if(!name)continue;const attrs={};for(const a of t.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))attrs[a[1]]=decode(a[2]??a[3]);const n={name,attrs,children:[],text:''};cur.children.push(n);if(!t.endsWith('/>'))stack.push(n);if(stack.length>80)throw Error('订阅源嵌套过深');}
 else cur.text+=t;
 }if(stack.length!==1)throw Error('订阅源 XML 不完整');return root;
}
const local=n=>n.name.split(':').pop();
function children(n,name){return n.children.filter(c=>local(c)===name);}
function content(n){return n?n.text+n.children.map(content).join(' '):'';}
const val=(n,name)=>decode(content(children(n,name)[0]));
function date(value,now){const t=Date.parse(value);return Number.isFinite(t)?new Date(t).toISOString():now;}
export function parseFeed(raw,url,now=new Date().toISOString()){
 if(raw.trim().startsWith('{')){const d=JSON.parse(raw);if(!Array.isArray(d.items)||!d.version?.includes('jsonfeed.org'))throw Error('不是有效的 JSON Feed');return {title:plain(d.title)||new URL(url).hostname,site:safeUrl(d.home_page_url,url),items:d.items.slice(0,100).map(i=>({key:String(i.id||i.url||i.title),title:plain(i.title)||'无标题',url:safeUrl(i.url||i.external_url,url),summary:plain(i.summary||i.content_text||i.content_html).slice(0,2500),published:date(i.date_published||i.date_modified,now)})).filter(i=>i.url)};}
 const root=xmlTree(raw);const feed=root.children.find(n=>['rss','feed','rdf'].includes(local(n)));if(!feed)throw Error('未找到 RSS / Atom 内容，请填写订阅源地址');
 const channel=children(feed,'channel')[0]||feed;const atom=local(feed)==='feed';
 const link=n=>atom?safeUrl(children(n,'link').find(x=>!x.attrs.rel||x.attrs.rel==='alternate')?.attrs.href||'',url):safeUrl(val(n,'link'),url);
 const entries=atom?children(feed,'entry'):[...children(channel,'item'),...(channel===feed?[]:children(feed,'item'))];
 return {title:plain(val(channel,'title'))||new URL(url).hostname,site:link(channel),items:entries.slice(0,100).map(n=>({key:val(n,atom?'id':'guid')||link(n)||val(n,'title'),title:plain(val(n,'title'))||'无标题',url:link(n),summary:plain(val(n,'description')||val(n,'summary')||val(n,'encoded')||val(n,'content')).slice(0,2500),published:date(val(n,'pubdate')||val(n,'published')||val(n,'updated')||val(n,'date'),now)})).filter(i=>i.url)};
}
