import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {resolve} from 'node:path';
import {mkdtempSync} from 'node:fs';
import assert from 'node:assert/strict';
const data=mkdtempSync(resolve('.local/remote-test-'));
const child=spawn(process.execPath,['.local/server.mjs'],{env:{...process.env,RSS_PORT:'8881',RSS_DATA_DIR:data,RSS_AUTH_USER:'reader',RSS_AUTH_PASSWORD:'test-only-secret'},stdio:'ignore'});
try{
 for(let i=0;i<60;i++){try{await fetch('http://127.0.0.1:8881');break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const base='http://127.0.0.1:8881';
 for(const path of ['/','/api/reader','/api/health','/api/refresh'])assert.equal((await fetch(base+path)).status,401);
 const auth='Basic '+Buffer.from('reader:test-only-secret').toString('base64');
 const headers={Authorization:auth,Origin:base,'Content-Type':'application/json'};
 assert.equal((await fetch(base+'/api/health',{headers})).status,200);
 assert.equal((await fetch(base+'/api/reader',{method:'POST',headers:{...headers,Origin:'https://attacker.invalid'},body:'{"action":"readAll"}'})).status,403);
 assert.equal((await fetch(base+'/api/reader',{method:'POST',headers,body:'{"action":"readAll"}'})).status,200);
 console.log('Access authentication and write-origin protections: PASS');
}finally{if(child.exitCode===null){const ended=once(child,'exit');child.kill();await ended;}}
