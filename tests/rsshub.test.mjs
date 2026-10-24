import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtempSync} from 'node:fs';
import {resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {normalizeInstance,resolveRoute,validateFeedUrl} from '../lib/rsshub.mjs';
test('RSSHub builds routes, preserves parameters and instance prefixes',()=>{
 assert.equal(resolveRoute('/github/issue/DIYgod/RSSHub/open?limit=10','http://localhost:1200'), 'http://localhost:1200/github/issue/DIYgod/RSSHub/open?limit=10');
 assert.equal(resolveRoute('rsshub://telegram/channel/awesomeRSSHub','https://example.com/hub/'),'https://example.com/hub/telegram/channel/awesomeRSSHub');
 assert.equal(resolveRoute('https://other.example/github/issue/a/b'),'https://other.example/github/issue/a/b');
 assert.equal(normalizeInstance('https://example.com/hub///'),'https://example.com/hub');
 for(const route of ['//evil.example/a','../admin','/%2e%2e/admin','javascript:alert(1)','/','/x#y','/x\\y'])assert.throws(()=>resolveRoute(route));
 for(const base of ['file:///tmp/x','http://user:pass@localhost:1200','http://localhost:1200?token=x'])assert.throws(()=>normalizeInstance(base));
});
test('Local access is limited to configured instance, including redirect targets',()=>{
 const reject=()=>{throw Error('Not public');};
 assert.equal(validateFeedUrl('http://127.0.0.1:1200/feed','http://127.0.0.1:1200',reject),'http://127.0.0.1:1200/feed');
 assert.throws(()=>validateFeedUrl('http://127.0.0.1:1201/feed','http://127.0.0.1:1200',reject));
 assert.throws(()=>validateFeedUrl('http://127.0.0.1:1200/admin','http://127.0.0.1:1200/hub',reject));
});
test('Local RSSHub subscription, persistence, daily pull and failed redirects',async()=>{
 let calls=0;
 const hub=createServer((req,res)=>{calls++;if(req.url==='/redirect'){res.writeHead(302,{Location:'http://127.0.0.1:9/private'});return res.end();}if(req.url==='/fail'){res.writeHead(503);return res.end();}if(req.url==='/challenge'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><html><head><title>Client Challenge</title></head><body>Enable JavaScript</body></html>');}res.setHeader('Content-Type','application/rss+xml');res.end('<rss><channel><title>RSSHub fixture</title><item><guid>one</guid><title>Issue one</title><link>https://github.com/DIYgod/RSSHub/issues/1</link><description>RSSHub content</description></item></channel></rss>');});
 await new Promise(r=>hub.listen(0,'127.0.0.1',r));const hubUrl=`http://127.0.0.1:${hub.address().port}`;
 const data=mkdtempSync(resolve('.local/hub-test-')),base='http://127.0.0.1:8879';let child;
 async function start(){child=spawn(process.execPath,['.local/server.mjs'],{env:{...process.env,RSS_PORT:'8879',RSS_DATA_DIR:data},stdio:'ignore'});for(let i=0;i<70;i++){try{if((await fetch(base+'/api/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('Server did not start');}
 async function stop(){if(child&&child.exitCode===null){const ended=once(child,'exit');child.kill();await ended;}}
 const state=async()=>await(await fetch(base+'/api/reader')).json();
 async function post(b){const r=await fetch(base+'/api/reader',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(b)});return {status:r.status,data:await r.json()};}
 try{
  await start();assert.equal((await post({action:'rsshubSettings',instance:hubUrl})).status,200);
  assert.equal((await post({action:'add',kind:'rsshub',url:'/github/issue/DIYgod/RSSHub/open?limit=10'})).status,200);let s=await state();assert.equal(s.articles.length,1);assert.equal(s.feeds[0].url,hubUrl+'/github/issue/DIYgod/RSSHub/open?limit=10');
  let r=await fetch(base+'/api/refresh',{method:'POST',headers:{Origin:base}});assert.equal((await r.json()).feeds[0].status,'skipped');assert.equal(calls,1);
  assert.equal((await post({action:'add',kind:'rsshub',url:'/redirect'})).status,400);
  const fail=await post({action:'add',kind:'rsshub',url:'/fail'});assert.equal(fail.status,400);assert.match(fail.data.error,/RSSHub.*503/);assert.equal((await state()).feeds.length,1);
  const challenge=await post({action:'add',kind:'rsshub',url:'/challenge'});assert.equal(challenge.status,400);assert.match(challenge.data.error,/浏览器验证/);assert.doesNotMatch(challenge.data.error,/DTD/);assert.equal((await state()).feeds.length,1);
  await stop();await start();assert.equal((await state()).rsshubInstance,hubUrl);
  // Switching the default instance must preserve existing local subscription URLs.
  assert.equal((await post({action:'rsshubSettings',instance:'https://rsshub.app'})).status,200);
  const sqlite=new DatabaseSync(resolve(data,'rss.sqlite'));sqlite.prepare("UPDATE feeds SET checked='2020-01-01T00:00:00Z'").run();sqlite.close();
  r=await fetch(base+'/api/refresh',{method:'POST',headers:{Origin:base}});assert.equal((await r.json()).feeds[0].status,'ok');assert.equal((await state()).articles.length,1);
 }finally{await stop();await new Promise(r=>hub.close(r));}
});
