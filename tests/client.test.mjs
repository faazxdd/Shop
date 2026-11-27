import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
const source=await readFile('supabase.js','utf8');
function client(){const data=new Map(),session=new Map();const context=vm.createContext({supabase:{createClient:()=>({})},localStorage:{getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)},sessionStorage:{getItem:k=>session.get(k),setItem:(k,v)=>session.set(k,v),removeItem:k=>session.delete(k)},crypto:globalThis.crypto,window:{dispatchEvent(){}},Event:class{}});vm.runInContext(source+';globalThis.api={Shop,esc,toCSV,parseCSV,validateImportRows};',context);return {...context.api,session};}
test('cart rejects corrupt storage and invalid quantities',()=>{const {Shop}=client();assert.equal(Shop.cart.count(),0);assert.throws(()=>Shop.cart.add('id',NaN));assert.throws(()=>Shop.cart.add('id',1.5));Shop.cart.add('id',2);Shop.cart.add('id',3);assert.equal(Shop.cart.count(),5);Shop.cart.setQty('id',0);assert.equal(Shop.cart.count(),0)});
test('CSV escaping and strict import validation',()=>{const a=client();assert.match(a.toCSV([{name:' =HYPERLINK("evil")'}]),/' =HYPERLINK/);assert.throws(()=>a.parseCSV('name,name\nx,x'),/Duplicate/);assert.throws(()=>a.parseCSV('name\n"missing'),/Unclosed/);assert.throws(()=>a.validateImportRows([{name:'Phone',quantity:'1.2'}]),/Invalid quantity/);assert.throws(()=>a.validateImportRows([{name:'Phone',selling_price:'NaN'}]),/Invalid selling_price/);assert.equal(a.parseCSV('name,description\nPhone,"A, B"')[0].description,'A, B')});
test('HTML escaping treats malicious markup as text',()=>{assert.equal(client().esc('<img onerror="x">'), '&lt;img onerror=&quot;x&quot;&gt;')});
test('checkout keeps a retry key and blocks changing an unresolved attempt',()=>{
 const {Shop,session}=client();
 const first=Shop._checkoutKey('first');
 assert.equal(Shop._checkoutKey('first'),first);
 assert.throws(()=>Shop._checkoutKey('changed'),/previous checkout/);
 session.set('checkout_rejected','1');
 assert.notEqual(Shop._checkoutKey('changed'),first);
});
