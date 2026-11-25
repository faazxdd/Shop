import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
test('service worker caches only static shell and never API/admin responses',async()=>{
 const handlers={},written=[];const ctx=vm.createContext({URL,Response,fetch:async()=>new Response('shell'),self:{location:{origin:'https://example.test'},registration:{scope:'https://example.test/Shop/'},addEventListener:(name,fn)=>handlers[name]=fn},caches:{open:async()=>({put:async(key)=>written.push(key)}),match:async()=>undefined}});
 vm.runInContext(await readFile('service-worker.js','utf8'),ctx);
 async function request(url){let response;const pending=[];handlers.fetch({request:{url,method:'GET',mode:'navigate'},respondWith:p=>response=p,waitUntil:p=>pending.push(p)});await response;await Promise.all(pending);return !!response}
 assert.equal(await request('https://example.test/Shop/admin.html'),false);
 assert.equal(await request('https://example.test/Shop/admin-commerce.js'),false);
 assert.equal(await request('https://example.test/Shop/private-export.csv'),false);
 assert.equal(await request('https://project.supabase.co/rest/v1/orders'),false);
 assert.equal(await request('https://example.test/Shop/products.html?product=123'),true);
 assert.deepEqual(written,['https://example.test/Shop/products.html']);
});
