import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';

test('seven-day read retention',async t=>{
 const directory=mkdtempSync(resolve('.local/retention-test-'));
 const output=resolve(directory,'runtime.mjs');
 await build({stdin:{contents:"export {createRss} from './lib/rss-core'; export {openDatabase} from './local/sqlite';",resolveDir:resolve('.')},outfile:output,bundle:true,platform:'node',format:'esm',logLevel:'silent'});
 const {createRss,openDatabase}=await import(pathToFileURL(output).href);
 const now=new Date('2026-10-24T04:00:00.000Z');
 const cutoff='2026-10-17T04:00:00.000Z';
 const item=key=>({key,title:key,url:`https://example.com/${key}`,summary:'Stored article content',published:'2026-01-01T00:00:00.000Z'});
 const id=(feed,key)=>createHash('sha256').update(feed+':'+key).digest('hex');
 let fixtureNumber=0;
 function fixture(t){
  const {adapter,db}=openDatabase(resolve(directory,`fixture-${fixtureNumber++}.sqlite`),resolve('.local/migrations/0000.sql'));
  t.after(()=>db.close());
  for(const feed of ['a','b'])db.prepare('INSERT INTO feeds(id,url,title,created) VALUES(?,?,?,?)').run(feed,`https://example.com/${feed}/feed`,feed,now.toISOString());
  return {db,rss:createRss(()=>adapter)};
 }
 try{
  await t.test('only unstarred read articles at or past the exact seven-day boundary are removed',async t=>{
   const {db,rss}=fixture(t);
   for(const key of ['expired','boundary','fresh','starred','unread'])await rss.saveItems('a',[item(key)]);
   const update=db.prepare('UPDATE articles SET read=?,saved=?,read_at=? WHERE id=?');
   update.run(1,0,'2026-10-01T00:00:00.000Z',id('a','expired'));
   update.run(1,0,cutoff,id('a','boundary'));
   update.run(1,0,'2026-10-17T04:00:00.001Z',id('a','fresh'));
   update.run(1,1,'2000-01-01T00:00:00.000Z',id('a','starred'));
   update.run(0,0,'2000-01-01T00:00:00.000Z',id('a','unread'));
   await rss.cleanupReadArticles(now);
   assert.deepEqual(db.prepare('SELECT title FROM articles ORDER BY title').all().map(row=>row.title),['fresh','starred','unread']);
   assert.equal(db.prepare('SELECT COUNT(*) AS n FROM deleted_articles').get().n,2);
   await rss.cleanupReadArticles(now);
   assert.equal(db.prepare('SELECT COUNT(*) AS n FROM deleted_articles').get().n,2);
  });
  await t.test('reading timestamps start on first read, survive repeated reads, and reset on unread',async t=>{
   const {db,rss}=fixture(t);await rss.saveItems('a',[item('one')]);const articleId=id('a','one');
   assert.equal(db.prepare('SELECT read_at FROM articles WHERE id=?').get(articleId).read_at,null);
   const before=Date.now();await rss.setRead(articleId,true);
   const first=db.prepare('SELECT read_at FROM articles WHERE id=?').get(articleId).read_at;
   assert(Date.parse(first)>=before&&Date.parse(first)<=Date.now());
   db.prepare('UPDATE articles SET read_at=? WHERE id=?').run(cutoff,articleId);
   await rss.setRead(articleId,true);assert.equal(db.prepare('SELECT read_at FROM articles WHERE id=?').get(articleId).read_at,cutoff);
   await rss.setRead(articleId,false);assert.deepEqual({...db.prepare('SELECT read,read_at FROM articles WHERE id=?').get(articleId)},{read:0,read_at:null});
   await rss.setRead(articleId,true);assert(Date.parse(db.prepare('SELECT read_at FROM articles WHERE id=?').get(articleId).read_at)>=before);
  });
  await t.test('read-all preserves existing deadlines and respects feed scope',async t=>{
   const {db,rss}=fixture(t);
   await rss.saveItems('a',[item('old'),item('new')]);await rss.saveItems('b',[item('other')]);
   db.prepare('UPDATE articles SET read=1,read_at=? WHERE id=?').run(cutoff,id('a','old'));
   await rss.readAll('a');
   assert.equal(db.prepare('SELECT read_at FROM articles WHERE id=?').get(id('a','old')).read_at,cutoff);
   assert(db.prepare('SELECT read_at FROM articles WHERE id=?').get(id('a','new')).read_at);
   assert.equal(db.prepare('SELECT read FROM articles WHERE id=?').get(id('b','other')).read,0);
   await rss.readAll();assert.equal(db.prepare('SELECT read FROM articles WHERE id=?').get(id('b','other')).read,1);
  });
  await t.test('saving protects expired articles; un-saving restores the original retention deadline',async t=>{
   const {db,rss}=fixture(t);await rss.saveItems('a',[item('one')]);
   db.prepare('UPDATE articles SET read=1,saved=1,read_at=? WHERE id=?').run(cutoff,id('a','one'));
   await rss.cleanupReadArticles(now);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM articles').get().n,1);
   assert.equal(db.prepare('SELECT COUNT(*) AS n FROM deleted_articles').get().n,0);
   db.prepare('UPDATE articles SET saved=0 WHERE id=?').run(id('a','one'));
   await rss.cleanupReadArticles(now);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM articles').get().n,0);
  });
  await t.test('daily imports cannot resurrect cleaned items, and live items retain their reading time',async t=>{
   const {db,rss}=fixture(t);await rss.saveItems('a',[item('old'),item('live')]);
   db.prepare('UPDATE articles SET read=1,read_at=? WHERE id=?').run(cutoff,id('a','old'));
   db.prepare('UPDATE articles SET read=1,saved=1,read_at=? WHERE id=?').run(cutoff,id('a','live'));
   await rss.cleanupReadArticles(now);
   await rss.saveItems('a',[{...item('old'),title:'Re-imported old content'},item('live'),item('new')]);
   assert.equal(db.prepare('SELECT COUNT(*) AS n FROM articles WHERE id=?').get(id('a','old')).n,0);
   assert.equal(db.prepare('SELECT read_at FROM articles WHERE id=?').get(id('a','live')).read_at,cutoff);
   assert.equal(db.prepare('SELECT read_at FROM articles WHERE id=?').get(id('a','new')).read_at,null);
   db.prepare('DELETE FROM feeds WHERE id=?').run('a');
   assert.equal(db.prepare('SELECT COUNT(*) AS n FROM deleted_articles').get().n,0);
  });
  await t.test('legacy upgrade, API read actions, restart cleanup and collection protection work in the running service',async()=>{
   const data=resolve(directory,'service'),base='http://127.0.0.1:8882';
   const initialized=openDatabase(resolve(data,'rss.sqlite'),resolve('.local/migrations/0000.sql'));initialized.db.close();
   let db=new DatabaseSync(resolve(data,'rss.sqlite'));
   // Recreate the original schema to exercise an upgrade from the deployed app.
   db.exec('DROP TABLE deleted_articles; DROP INDEX articles_retention; ALTER TABLE articles DROP COLUMN read_at; DELETE FROM local_migrations WHERE name=\'0001\';');
   for(const feed of ['a','b'])db.prepare('INSERT INTO feeds(id,url,title,created) VALUES(?,?,?,?)').run(feed,`https://example.com/${feed}/feed`,feed,new Date().toISOString());
   const insert=db.prepare('INSERT INTO articles(id,feed_id,title,url,summary,published,fetched,read,saved) VALUES(?,?,?,?,?,?,?,?,?)');
   for(const [key,feed,read,saved] of [['legacy','a',1,0],['saved','a',1,1],['unread','a',0,0],['other','b',0,0]])insert.run(key,feed,key,`https://example.com/${key}`,'Content','2000-01-01T00:00:00.000Z','2000-01-01T00:00:00.000Z',read,saved);
   db.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('last_run',JSON.stringify({status:'completed',at:new Date().toISOString(),feeds:[]}));db.close();
   let child,logs='';
   async function start(){
    child=spawn(process.execPath,['.local/server.mjs'],{env:{...process.env,RSS_BIND:'127.0.0.1',RSS_PORT:'8882',RSS_DATA_DIR:data,RSS_AUTH_PASSWORD:'',RSS_PUBLIC_ORIGIN:'',RSS_TLS_CERT:'',RSS_TLS_KEY:''},stdio:['ignore','pipe','pipe']});
    child.stdout.on('data',chunk=>logs+=chunk);child.stderr.on('data',chunk=>logs+=chunk);
    for(let i=0;i<80;i++){try{const response=await fetch(base+'/api/health');if(response.ok){assert.equal((await response.json()).readRetentionDays,7);return;}}catch{}await new Promise(done=>setTimeout(done,50));}
    throw Error('Test service did not start: '+logs);
   }
   async function stop(){if(child&&child.exitCode===null){const ended=once(child,'exit');child.kill();await ended;}}
   async function post(body){const response=await fetch(base+'/api/reader',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(response.status,200,await response.text());}
   try{
    const before=Date.now();await start();db=new DatabaseSync(resolve(data,'rss.sqlite'));
    const legacyTime=db.prepare('SELECT read_at FROM articles WHERE id=?').get('legacy').read_at;
    assert(Date.parse(legacyTime)>=before);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM articles').get().n,4);
    assert.equal(db.prepare('SELECT read_at FROM articles WHERE id=?').get('unread').read_at,null);
    await post({action:'article',id:'unread',field:'read',value:true});assert(db.prepare('SELECT read_at FROM articles WHERE id=?').get('unread').read_at);
    await post({action:'readAll',feedId:'a'});assert.equal(db.prepare('SELECT read_at FROM articles WHERE id=?').get('legacy').read_at,legacyTime);
    assert.equal(db.prepare('SELECT read FROM articles WHERE id=?').get('other').read,0);
    await post({action:'article',id:'unread',field:'read',value:false});
    await stop();
    db.prepare('UPDATE articles SET read_at=? WHERE id IN (?,?)').run('2000-01-01T00:00:00.000Z','legacy','saved');db.close();db=null;
    await start();db=new DatabaseSync(resolve(data,'rss.sqlite'));
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM articles WHERE id=?').get('legacy').n,0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM articles WHERE id=?').get('saved').n,1);
    assert.equal(db.prepare('SELECT read_at FROM articles WHERE id=?').get('unread').read_at,null);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM deleted_articles WHERE id=?').get('legacy').n,1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM local_migrations WHERE name=?').get('0001').n,1);
   }finally{await stop();db?.close();}
  });
 }finally{
  assert(directory.startsWith(resolve('.local')+sep));rmSync(directory,{recursive:true,force:true});
 }
});
