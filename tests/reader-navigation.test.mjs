import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {act,createElement} from 'react';

const flush=()=>new Promise(done=>setImmediate(done));
const article=(id,hour,extra={})=>({id,title:`文章 ${id.toUpperCase()}`,url:`https://example.com/${id}`,summary:`摘要 ${id}`,published:`2026-10-24T${hour}:00:00Z`,feed_id:'tech',feed_title:'技术订阅',category:'科技',read:0,saved:1,...extra});

test('article reader keyboard navigation',async t=>{
 const directory=mkdtempSync(resolve('.local/reader-test-'));
 const output=resolve(directory,'reader.mjs');
 await build({entryPoints:['app/reader.tsx'],outfile:output,bundle:true,platform:'node',format:'esm',jsx:'automatic',loader:{'.css':'empty'},external:['react','react/*','lucide-react'],logLevel:'silent'});
 const {default:Reader}=await import(pathToFileURL(output).href);
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'http://localhost:8787/'});
 dom.window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
 const originals=new Map();
 const globals={window:dom.window,document:dom.window.document,Element:dom.window.Element,HTMLElement:dom.window.HTMLElement,localStorage:dom.window.localStorage,matchMedia:dom.window.matchMedia,IS_REACT_ACT_ENVIRONMENT:true};
 for(const [key,value] of Object.entries(globals)){originals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});}
 const originalFetch=globalThis.fetch;
 const {createRoot}=await import('react-dom/client');
 let root,state,requests,delays;
 async function mount(items=[article('a','04'),article('b','03'),article('c','02')]){
  state={feeds:[{id:'tech',title:'技术订阅',category:'科技',url:'https://example.com/feed'},{id:'life',title:'生活订阅',category:'生活',url:'https://example.com/life'}],articles:structuredClone(items),lastRun:null};
  requests=[];delays=new Map();
  globalThis.fetch=async(_url,options)=>{
   if(!options)return new Response(JSON.stringify(state));
   const body=JSON.parse(options.body);requests.push(body);
   if(body.action==='article'){
    const delay=delays.get(`${body.id}:${body.field}`);if(delay)await delay.promise;
    state.articles.find(item=>item.id===body.id)[body.field]=body.value?1:0;
   }
   return new Response('{"ok":true}');
  };
  root=createRoot(document.getElementById('root'));
  await act(async()=>{root.render(createElement(Reader));await flush();});
 }
 async function unmount(){if(root){await act(async()=>root.unmount());root=null;}}
 async function click(selector){const button=document.querySelector(selector);assert(button,selector);await act(async()=>{button.click();await flush();});}
 async function key(name,options={},target=document.activeElement){const event=new dom.window.KeyboardEvent('keydown',{key:name,bubbles:true,cancelable:true,...options});await act(async()=>{target.dispatchEvent(event);await flush();});return event;}
 async function change(selector,value){const input=document.querySelector(selector);assert(input,selector);await act(async()=>{input.value=value;input.dispatchEvent(new dom.window.Event('change',{bubbles:true}));await flush();});}
 const title=()=>document.querySelector('#article-title')?.textContent;
 const position=()=>document.querySelector('.reader-position [role="status"]')?.textContent;
 const disabled=direction=>document.querySelector(`[aria-label="${direction}一篇文章"]`).disabled;
 function defer(id,field){let release;const promise=new Promise(done=>release=done);delays.set(`${id}:${field}`,{promise});return async()=>{await act(async()=>{release();await flush();});};}
 try{
  await t.test('left/right, buttons, boundaries, focus, scrolling and Escape',async t=>{
   t.after(unmount);
   await mount();
   assert.equal((await key('ArrowRight',{},document.body)).defaultPrevented,false);
   await click('.article-title');assert.equal(title(),'文章 A');assert.equal(position(),'1 / 3');assert.equal(document.activeElement,document.querySelector('.reader-panel'));assert(disabled('上'));
   await key('ArrowLeft');assert.equal(title(),'文章 A');
   document.querySelector('.reader-panel').scrollTop=250;
   await key('ArrowRight');assert.equal(title(),'文章 B');assert.equal(position(),'2 / 3');assert.equal(document.querySelector('.reader-panel').scrollTop,0);
   await click('[aria-label="下一篇文章"]');assert.equal(title(),'文章 C');assert(disabled('下'));
   await key('ArrowRight');assert.equal(title(),'文章 C');
   await click('[aria-label="上一篇文章"]');assert.equal(title(),'文章 B');
   await key('ArrowLeft');assert.equal(title(),'文章 A');
   assert.deepEqual(state.articles.map(a=>a.read),[1,1,1]);
   await key('Escape');assert.equal(title(),undefined);
   assert.equal((await key('ArrowRight',{},document.body)).defaultPrevented,false);
   await unmount();
  });
  await t.test('unread articles retain their opening order as items leave the list',async t=>{
   t.after(unmount);
   await mount();await click('.main-nav button:nth-child(2)');await click('.article-title');
   assert.equal(document.querySelectorAll('.article-title').length,2);
   await key('ArrowRight');assert.equal(title(),'文章 B');assert.equal(position(),'2 / 3');
   await key('ArrowRight');assert.equal(title(),'文章 C');assert.equal(document.querySelectorAll('.article-title').length,0);
   await key('ArrowLeft');assert.equal(title(),'文章 B');
   await unmount();
  });
  await t.test('tag filters and oldest-first sorting define the reading sequence',async t=>{
   t.after(unmount);
   await mount([article('a','04'),article('b','03'),article('c','02'),article('d','05',{feed_id:'life',feed_title:'生活订阅',category:'生活'})]);
   await change('[aria-label="按标签展示订阅源"]','科技');await change('[aria-label="排序"]','old');
   await click('.article-title');assert.equal(title(),'文章 C');assert.equal(position(),'1 / 3');
   await key('ArrowRight');assert.equal(title(),'文章 B');await key('ArrowRight');assert.equal(title(),'文章 A');assert(disabled('下'));
   await key('Escape');await change('[aria-label="按标签展示订阅源"]','生活');await click('.article-title');
   assert.equal(title(),'文章 D');assert.equal(position(),'1 / 1');assert(disabled('上'));assert(disabled('下'));
   await unmount();
  });
  await t.test('typing, editing, composing and modified keys do not change articles',async t=>{
   t.after(unmount);
   await mount();await click('.article-title');
   for(const modifier of ['altKey','ctrlKey','metaKey','shiftKey','isComposing']){assert.equal((await key('ArrowRight',{[modifier]:true})).defaultPrevented,false);assert.equal(title(),'文章 A');}
   for(const selector of ['.search input','[aria-label="排序"]']){assert.equal((await key('ArrowRight',{},document.querySelector(selector))).defaultPrevented,false);assert.equal(title(),'文章 A');}
   await key('ArrowRight',{},document.querySelector('[role="separator"]'));assert.equal(title(),'文章 A');
   assert.equal((await key('ArrowDown')).defaultPrevented,false);assert.equal(title(),'文章 A');
   await unmount();
  });
  await t.test('late read and bookmark responses cannot reopen a previous article',async t=>{
   t.after(unmount);
   await mount();const finishRead=defer('a','read');await click('.article-title');await key('ArrowRight');
   assert.equal(title(),'文章 B');await finishRead();assert.equal(title(),'文章 B');
   const finishSaved=defer('b','saved');await click('.reader-actions .secondary');await key('ArrowRight');
   assert.equal(title(),'文章 C');await finishSaved();assert.equal(title(),'文章 C');
   await key('ArrowLeft');assert.equal(title(),'文章 B');assert.equal(document.querySelector('.reader-actions .secondary').textContent,'收藏');
   await unmount();
  });
 }finally{
  await unmount();globalThis.fetch=originalFetch;dom.window.close();
  for(const [key,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
  assert(directory.startsWith(resolve('.local')+sep));rmSync(directory,{recursive:true,force:true});
 }
});
