import {spawn} from 'node:child_process';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {resolve} from 'node:path';
const url='http://127.0.0.1:8878';
const directory=mkdtempSync(resolve('.local/smoke-'));
let child;let output='';
async function start(){child=spawn(process.execPath,['.local/server.mjs'],{env:{...process.env,RSS_PORT:'8878',RSS_DATA_DIR:directory},stdio:['ignore','pipe','pipe']});child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);for(let i=0;i<80;i++){try{if((await fetch(url+'/api/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error(output);}
async function stop(){if(child&&child.exitCode===null){const end=once(child,'exit');child.kill();await end;}}
async function post(body,origin=url){const r=await fetch(url+'/api/reader',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
try{
 await start();let r=await fetch(url);assert.equal(r.status,200);assert.match(await r.text(),/拾读/);assert.equal((await post({action:'readAll'},'https://foreign.example')).status,403);
 let d=await post({action:'add',url:'https://sspai.com/feed',category:'科技'});assert.equal(d.status,200,JSON.stringify(d));
 let state=await (await fetch(url+'/api/reader')).json();assert.equal(state.feeds.length,1);assert.ok(state.articles.length>0);const a=state.articles[0];
 assert.equal((await post({action:'article',id:a.id,field:'saved',value:true})).status,200);
 assert.equal((await post({action:'article',id:a.id,field:'read',value:true})).status,200);
 console.log('Real feed fetch, bookmarks and reading state: PASS');
 await stop();await start();state=await(await fetch(url+'/api/reader')).json();assert.equal(state.articles.find(x=>x.id===a.id).saved,1);assert.equal(state.articles.find(x=>x.id===a.id).read,1);console.log('Database persisted across restart: PASS');
 r=await fetch(url+'/api/refresh',{method:'POST',headers:{Origin:url}});d=await r.json();assert.equal(d.feeds[0].status,'skipped');console.log('Same-day duplicate pull skipped: PASS');
 const bad=await post({action:'add',url:'http://127.0.0.1/feed'});assert.equal(bad.status,400);
 assert.equal((await post({action:'delete',id:state.feeds[0].id})).status,200);state=await(await fetch(url+'/api/reader')).json();assert.equal(state.articles.length,0);console.log('Unsubscribe and local access protections: PASS');
}finally{await stop();}
