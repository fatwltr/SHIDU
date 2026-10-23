export const DEFAULT_RSSHUB='https://rsshub.app';
export function normalizeInstance(raw){
 let u;try{u=new URL(String(raw).trim());}catch{throw Error('请输入完整的 RSSHub 实例地址，例如 http://localhost:1200');}
 if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash)throw Error('实例地址须为 HTTP / HTTPS 地址，不包含账号、查询参数或片段');
 u.pathname=u.pathname.replace(/\/+$/,'')+'/';return u.href.replace(/\/$/,'');
}
export function resolveRoute(raw,instance=DEFAULT_RSSHUB){
 const input=String(raw).trim();if(!input||input.length>2000)throw Error('请输入 RSSHub 路由或完整链接');
 if(/^https?:\/\//i.test(input)){const u=new URL(input);if(u.username||u.password||u.hash)throw Error('订阅链接不能包含账号或片段');return u.href;}
 const route=input.replace(/^rsshub:\/\//i,'');
 if(route.startsWith('//')||route.includes('\\')||/^[a-z][a-z\d+.-]*:/i.test(route)||route.includes('#')||route.split('?')[0].split('/').some(p=>{try{return ['.','..'].includes(decodeURIComponent(p));}catch{return true;}}))throw Error('RSSHub 路由格式无效');
 const base=normalizeInstance(instance);const path=route.replace(/^\//,'');if(!path||path.startsWith('?'))throw Error('请填写具体的 RSSHub 路由');
 return new URL(path,base+'/').href;
}
export function validateFeedUrl(raw,instance,publicValidator){
 const u=new URL(raw),base=new URL(normalizeInstance(instance));
 if(['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&!u.hash&&u.origin===base.origin&&(base.pathname==='/'||u.pathname.startsWith(base.pathname.replace(/\/$/,'')+'/')))return u.href;
 return publicValidator(raw);
}
