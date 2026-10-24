import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
import {parseFeed} from '../lib/feed-parser.mjs';

const rss=`<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>Reading &amp; ideas</title><link>https://example.com</link><item><guid>article-1</guid><title><![CDATA[A <b>good</b> read]]></title><link>https://example.com/one</link><content:encoded><![CDATA[<p>Hello <strong>world</strong>.</p>]]></content:encoded><pubDate>Wed, 21 Oct 2026 08:00:00 GMT</pubDate></item></channel></rss>`;
test('RSS decodes namespaces and CDATA, strips HTML and preserves item identity',()=>{const r=parseFeed(rss,'https://example.com/feed');assert.equal(r.title,'Reading & ideas');assert.equal(r.items[0].title,'A good read');assert.equal(r.items[0].key,'article-1');assert.equal(r.items[0].summary,'Hello world .');});
test('Atom supports alternate links, relative URLs and fallback dates',()=>{const r=parseFeed(`<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom</title><entry><id>1</id><title>Entry</title><link rel="self" href="/api/1"/><link rel="alternate" href="/story"/><summary>&lt;p&gt;Some text&lt;/p&gt;</summary></entry></feed>`,'https://example.com/feed','2026-10-22T00:00:00.000Z');assert.equal(r.items[0].url,'https://example.com/story');assert.equal(r.items[0].summary,'Some text');assert.equal(r.items[0].published,'2026-10-22T00:00:00.000Z');});
test('JSON Feed supported, unsafe article protocols omitted',()=>{const r=parseFeed(JSON.stringify({version:'https://jsonfeed.org/version/1.1',title:'Feed',items:[{id:'1',url:'javascript:alert(1)'},{id:'2',url:'https://example.com/ok',content_html:'<p>OK</p>'}]}),'https://example.com/feed');assert.equal(r.items.length,1);assert.equal(r.items[0].summary,'OK');});
test('Malformed XML, non-feeds and entity expansion are rejected',()=>{for(const raw of ['<html>no feed</html>','<rss><channel>','<!DOCTYPE rss [<!ENTITY a "x">]><rss/>','<rss></channel>'])assert.throws(()=>parseFeed(raw,'https://example.com/feed'));});

test('HTTP-200 HTML verification pages are reported as browser challenges, not RSS DTD errors',()=>{
 const html='<!doctype html><html><head><title>Client Challenge</title></head><body>Please enable JavaScript to proceed.</body></html>';
 for(const prefix of ['', '\uFEFF \n', '<?xml version="1.0"?>\n<!-- generated -->\n']){
  assert.throws(()=>parseFeed(prefix+html,'https://example.com/feed'),error=>/浏览器验证/.test(error.message)&&!/DTD/.test(error.message));
 }
 assert.throws(()=>parseFeed('<html><head><title>Login</title></head><body>Sign in</body></html>','https://example.com/feed'),/HTML 网页/);
});

test('WordPress HTML doctypes and declaration examples inside CDATA/comments are safe article text',()=>{
 const raw='<?xml version="1.0"?><!-- Example: <!DOCTYPE rss> --><?note example="<!ENTITY example>"?><rss xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>Client Challenge</title><item><guid>one</guid><title>Newsletter</title><link>https://example.com/post</link><content:encoded><![CDATA[<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "https://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd"><html><body><p>Newsletter content.</p></body></html>]]></content:encoded></item></channel></rss>';
 const parsed=parseFeed(raw,'https://example.com/feed');assert.equal(parsed.items.length,1);assert.equal(parsed.items[0].summary,'Newsletter content.');
 assert.equal(parseFeed(raw.replace('Newsletter content.','Example: <!ENTITY example "text">'),'https://example.com/feed').items.length,1);
});

test('actual DTD and entity declarations remain rejected outside ignored text regions',()=>{
 for(const declaration of ['<!DOCTYPE rss SYSTEM "https://example.com/external.dtd">','<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///etc/passwd">]>','<!ENTITY x "expanded">','<!doctype rss>']){
  assert.throws(()=>parseFeed('<!-- harmless --><![CDATA[<!DOCTYPE html>]]>'+declaration+'<rss><channel/></rss>','https://example.com/feed'),/DTD/);
 }
});

test('Daily updater persists data, skips same-day pulls, preserves reading state and reports failures',async()=>{
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../drizzle/0000_worried_baron_zemo.sql',import.meta.url),'utf8'));
 sqlite.exec(readFileSync(new URL('../drizzle/0001_article_retention.sql',import.meta.url),'utf8'));
 const wrap=(sql,args=[])=>({bind(...a){return wrap(sql,a);},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};},async run(){return sqlite.prepare(sql).run(...args);}});
 globalThis.__rssTestEnv={DB:{prepare:sql=>wrap(sql),batch:async stmts=>{sqlite.exec('BEGIN');try{const values=[];for(const s of stmts)values.push(await s.run());sqlite.exec('COMMIT');return values;}catch(e){sqlite.exec('ROLLBACK');throw e;}}}};
 let code=ts.transpileModule(readFileSync(new URL('../lib/rss-core.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 code=code.replace(/import \{ env \} from 'cloudflare:workers';/, 'const env=globalThis.__rssTestEnv;').replace("'./feed-parser.mjs'",JSON.stringify(new URL('../lib/feed-parser.mjs',import.meta.url).href));
 const {createRss}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));const mod=createRss(()=>globalThis.__rssTestEnv.DB);
 for(const u of ['http://localhost/rss','http://127.0.0.1/rss','http://[::1]/rss','http://x.internal/rss','ftp://example.com/rss','https://user:pass@example.com/rss','http://example.com:8080/'])assert.throws(()=>mod.publicUrl(u));
 const originalFetch=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response(rss,{headers:{etag:'"v1"'}});};
 try{
  const id=await mod.addFeed('https://example.com/feed','科技');let state=await mod.state();assert.equal(state.feeds.length,1);assert.equal(state.articles.length,1);assert.equal(calls,1);
  sqlite.prepare('UPDATE articles SET read=1,saved=1').run();
  let result=await mod.refreshAll();assert.equal(result.feeds[0].status,'skipped');assert.equal(calls,1);
  sqlite.prepare("UPDATE feeds SET checked='2020-01-01T00:00:00Z'").run();
  globalThis.fetch=async(url,options)=>{calls++;assert.equal(options.headers['If-None-Match'],'"v1"');return new Response(rss.replace('Hello','Updated'),{headers:{etag:'"v2"'}});};
  result=await mod.refreshAll();assert.equal(result.feeds[0].status,'ok');state=await mod.state();assert.equal(state.articles.length,1);assert.equal(state.articles[0].saved,1);assert.equal(state.articles[0].read,1);assert.match(state.articles[0].summary,/Updated/);
  sqlite.prepare("UPDATE feeds SET checked='2020-01-01T00:00:00Z'").run();globalThis.fetch=async()=>new Response(null,{status:304});result=await mod.refreshAll();assert.equal(result.feeds[0].status,'ok');assert.equal((await mod.state()).articles.length,1);
  sqlite.prepare("UPDATE feeds SET checked='2020-01-01T00:00:00Z'").run();globalThis.fetch=async()=>new Response(null,{status:503});result=await mod.refreshAll();assert.equal(result.feeds[0].status,'error');state=await mod.state();assert.match(state.feeds[0].error,/503/);assert.equal(state.articles.length,1);assert.equal(state.lastRun.at,result.at);
  globalThis.fetch=async()=>{throw Error('Must not fetch twice in a day');};result=await mod.refreshAll();assert.equal(result.feeds[0].status,'skipped');
 }finally{globalThis.fetch=originalFetch;delete globalThis.__rssTestEnv;sqlite.close();}
});
