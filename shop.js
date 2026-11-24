/* shop.js - UI layer for the customer pages (works with supabase.js, does not touch the admin files) */
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const IC={sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/>',moon:'<path d="M20 15a9 9 0 0 1-11-11 9 9 0 1 0 11 11Z"/>',
search:'<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21.2l7.8-7.7 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>',
bag:'<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/>',
home:'<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/>',
grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
plus:'<path d="M12 5v14M5 12h14"/>',minus:'<path d="M5 12h14"/>',x:'<path d="M18 6 6 18M6 6l12 12"/>',check:'<path d="m5 12 5 5 9-10"/>',
copy:'<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
phone:'<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
chat:'<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.5 8.5 0 0 1-3.8-.9L3 21l2-5.2A8.4 8.4 0 1 1 21 11.5z"/>',
shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
clock:'<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
box:'<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
alert:'<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>'};
const ic=(n,f)=>`<svg class="ic" viewBox="0 0 24 24" fill="${f?'currentColor':'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n]}</svg>`;

/* ---------- small helpers used by the pages ---------- */
function fmtDate(v){const d=new Date(v);return isNaN(d)?'':d.toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}
async function withBusy(btn,fn){if(btn.disabled)return;btn.disabled=true;btn.classList.add('busy');try{return await fn()}finally{btn.disabled=false;btn.classList.remove('busy')}}
let _tt;function toast(m,t){let e=$('#toast');if(!e){e=document.createElement('div');e.id='toast';e.setAttribute('role','status');document.body.append(e)}e.className='toast '+(t||'');e.textContent=m;clearTimeout(_tt);requestAnimationFrame(()=>e.classList.add('show'));_tt=setTimeout(()=>e.classList.remove('show'),2200)}
let _dlg;
function sheet(html){let o=$('#sheet');if(!o){o=document.createElement('div');o.id='sheet';o.className='ov';o.addEventListener('click',e=>{if(e.target===o||e.target.closest('[data-close]'))closeSheet()});document.body.append(o)}o.innerHTML=`<div class="sh" role="dialog" aria-modal="true">${html}</div>`;o.classList.add('open');document.body.classList.add('lock')}
function closeSheet(){const o=$('#sheet');if(o)o.classList.remove('open');document.body.classList.remove('lock');if(_dlg){const d=_dlg;_dlg=null;d(false)}}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeSheet()});
function confirmDialog(msg,ok='Confirm'){return new Promise(res=>{_dlg=res;sheet(`<button class="x" data-close aria-label="Close">${ic('x')}</button><p class="dm">${esc(msg)}</p><div class="dr"><button class="btn" data-close>Cancel</button><button class="btn dark" data-ok>${esc(ok)}</button></div>`);$('#sheet [data-ok]').onclick=()=>{_dlg=null;closeSheet();res(true)}})}
const emptyHtml=(i,t,p,b)=>`<div class="empty"><div class="big">${ic(i)}</div><h2>${esc(t)}</h2>${p?`<p>${p}</p>`:''}${b||''}</div>`;

/* ---------- products ---------- */
const PC=Object.create(null);
function recentIds(){try{const a=JSON.parse(localStorage.getItem('fz_recent')||'[]');return Array.isArray(a)?a.filter(x=>typeof x==='string').slice(0,8):[]}catch{return []}}
function rememberProduct(id){try{localStorage.setItem('fz_recent',JSON.stringify([id,...recentIds().filter(x=>x!==id)].slice(0,8)));window.dispatchEvent(new Event('recent-changed'))}catch{}}
async function shareProduct(p){const url=new URL('products.html',location.href);url.searchParams.set('product',p.id);try{if(navigator.share){await navigator.share({title:p.name,url:url.href});return}if(navigator.clipboard){await navigator.clipboard.writeText(url.href);toast('Product link copied','ok');return}}catch(e){if(e.name==='AbortError')return}window.prompt('Copy product link',url.href)}

const stockOf=p=>/out/i.test(p.stock_status||'')?'out':/low/i.test(p.stock_status||'')?'low':'in';
function productCardHtml(p){PC[p.id]=p;const s=stockOf(p),im=(p.images||[])[0],sv=Shop.favs.has(p.id),id=esc(p.id);
return `<article class="pc"><div><div class="pi" data-open="${id}" role="button" tabindex="0" aria-label="View ${esc(p.name)}">${im?`<img loading="lazy" src="${esc(im)}" alt="${esc(p.name)}">`:'<span class="missing-photo">'+ic('box')+'No image</span>'}${s!=='in'?`<span class="bdg ${s}">${s==='out'?'Out of stock':'Low stock'}</span>`:''}<button class="hb ${sv?'on':''}" data-fav="${id}" aria-label="Save product">${ic('heart',sv)}</button></div><div class="pm">${esc(p.category_name||'')}</div><h3 class="pt" data-open="${id}" role="button" tabindex="0">${esc(p.name)}</h3></div><div class="pf"><span class="price">${money(p.selling_price)}</span><button class="btn dark sm" data-add="${id}" ${s==='out'?'disabled':''}>${ic('plus')}Add</button></div></article>`}
async function openProduct(id){let p=PC[id];if(!p){try{p=await Shop.product(id)}catch(e){return toast(errMsg(e),'bad')}}if(!p)return toast('Product is no longer available','bad');PC[id]=p;rememberProduct(id);
const im=p.images||[],s=stockOf(p),sv=Shop.favs.has(p.id);let q=1;
sheet(`<button class="x" data-close aria-label="Close">${ic('x')}</button><div class="pd"><div class="pdi"><div class="pi">${im[0]?`<img id="pd-img" src="${esc(im[0])}" alt="${esc(p.name)}">`:ic('box')}</div>${im.length>1?`<div class="th">${im.map((u,i)=>`<button class="${i?'':'on'}" data-th="${esc(u)}" aria-label="Image ${i+1}"><img src="${esc(u)}" alt=""></button>`).join('')}</div>`:''}</div><div class="pdt"><div class="pm">${esc(p.category_name||'')}</div><h2>${esc(p.name)}</h2><div class="big">${money(p.selling_price)}</div><div><span class="st ${s}">${s==='out'?'Out of stock':s==='low'?'Low stock':'In stock'}</span></div>${p.description?`<p class="muted">${esc(p.description)}</p>`:''}<button class="btn" id="share-product" type="button">Share product</button><div class="row" style="align-items:center"><div class="qty"><button id="pq-" aria-label="Less">${ic('minus')}</button><span id="pq">1</span><button id="pq+" aria-label="More">${ic('plus')}</button></div><button class="btn dark" id="pq-add" ${s==='out'?'disabled':''}>${ic('bag')}Add to cart</button><button class="btn" data-fav="${esc(p.id)}">${ic('heart',sv)}${sv?'Saved':'Save'}</button></div></div></div>`);
$('#share-product').onclick=()=>shareProduct(p);const sh=$('#sheet');sh.onclick=e=>{const t=e.target.closest('[data-th]');if(t){const old=$('#pd-img');if(old)old.src=t.dataset.th;else{const img=document.createElement('img');img.id='pd-img';img.alt=p.name;img.src=t.dataset.th;$('.pdi .pi',sh).replaceChildren(img)}$$('.th button',sh).forEach(b=>b.classList.toggle('on',b===t))}};
$('#pq-').onclick=()=>$('#pq').textContent=q=Math.max(1,q-1);$('#pq\\+').onclick=()=>$('#pq').textContent=q=Math.min(99,q+1);
$('#pq-add').onclick=()=>{Shop.cart.add(p.id,q);closeSheet();toast('Added to cart','ok')}}
document.addEventListener('click',e=>{
const f=e.target.closest('[data-fav]');if(f){e.preventDefault();e.stopPropagation();const id=f.dataset.fav,on=Shop.favs.toggle(id);$$('[data-fav]').forEach(b=>{if(b.dataset.fav===id){b.classList.toggle('on',on);b.innerHTML=ic('heart',on)+(b.classList.contains('btn')?(on?'Saved':'Save'):'')}});toast(on?'Saved for later':'Removed from saved');return}
const a=e.target.closest('[data-add]');if(a){if(a.disabled||stockOf(PC[a.dataset.add]||{})==='out')return;e.stopPropagation();Shop.cart.add(a.dataset.add,1);toast('Added to cart','ok');return}
const o=e.target.closest('[data-open]');if(o)openProduct(o.dataset.open)});

/* ---------- header, dock, footer, settings ---------- */
const NAV=[['home','index.html','Home','home'],['shop','products.html','Products','grid'],['saved','products.html?saved=1','Saved','heart'],['orders','orders.html','My orders','list'],['cart','cart.html','Cart','bag']];
function counts(){const c=Shop.cart.count(),f=Shop.favs.get().length;$$('[data-cartcount]').forEach(e=>e.textContent=c||'');$$('[data-favcount]').forEach(e=>e.textContent=f||'')}
function renderSiteHeader(active){
$('#util').className='util';$('#util').innerHTML=`<div><b data-biz>FZ Cart</b><span class="hide-s"></span></div><div class="u2"><a id="u-wa" hidden target="_blank" rel="noopener"></a><a href="orders.html">Track order</a></div>`;
const h=$('#site-header');h.className='hd';
h.innerHTML=`<div class="hd-in"><a class="brand" href="index.html"><span class="mark" data-mark>FZ</span><span><b data-biz>FZ Cart</b></span></a><nav class="nav" aria-label="Main">${NAV.slice(0,4).map(n=>`<a href="${n[1]}" class="${n[0]===active?'on':''}">${n[2]}</a>`).join('')}</nav><div class="acts"><button class="ib" id="theme-switch" type="button" aria-label="Switch theme"></button><a class="ib" href="products.html?focus=1" aria-label="Search">${ic('search')}</a><a class="ib" href="products.html?saved=1" aria-label="Saved products">${ic('heart')}<i class="cnt" data-favcount></i></a><a class="btn dark" href="cart.html">${ic('bag')}<span>Cart</span><i class="cnt" data-cartcount></i></a></div></div>`;
$('#site-footer').className='ft';
$('#site-footer').innerHTML=`<b data-biz>FZ Cart</b><a href="products.html">Products</a><a href="orders.html">Orders</a><div id="f-contact"></div><div class="cp">&copy; ${new Date().getFullYear()} <span data-biz>FZ Cart</span></div>`;
if(!$('.dock')){const d=document.createElement('nav');d.className='dock';d.setAttribute('aria-label','Quick navigation');d.innerHTML=NAV.map(n=>`<a href="${n[1]}" class="${n[0]===active?'on':''}">${ic(n[3])}<span>${n[2].replace('My orders','Orders')}</span>${n[0]==='cart'?'<i class="cnt" data-cartcount></i>':''}</a>`).join('');document.body.append(d)}
counts();const toggle=$('#theme-switch');function paintTheme(){const dark=document.documentElement.dataset.shopTheme==='dark';toggle.innerHTML=ic(dark?'sun':'moon');toggle.setAttribute('aria-label',dark?'Switch to light mode':'Switch to dark mode');document.querySelector('meta[name="theme-color"]').content=dark?'#101010':'#ffffff'}toggle.onclick=()=>{const next=document.documentElement.dataset.shopTheme==='dark'?'light':'dark';document.documentElement.dataset.shopTheme=next;try{localStorage.setItem('shop-theme',next)}catch{}paintTheme()};paintTheme()}
window.addEventListener('cart-changed',counts);window.addEventListener('favs-changed',counts);
async function applyBusinessSettings(){
try{const s=await Shop.settings();if(!s)return null;window._shopSettings=s;
const n='FZ Cart';$$('[data-biz]').forEach(e=>e.textContent=n);$$('[data-mark]').forEach(e=>e.textContent='FZ');
const raw=(s.contact_phone||'').trim(),d=raw.replace(/\D/g,'');
if(d){const w=$('#u-wa');if(w){w.href='https://wa.me/'+d;w.textContent='WhatsApp '+raw;w.hidden=false}
const c=$('#f-contact');if(c)c.innerHTML=`<strong style="color:#fff">${esc(raw)}</strong><div class="row mt"><a class="btn sm" style="display:inline-flex;background:#fff;color:#0f172a" href="tel:${esc(raw.replace(/[^+\d]/g,''))}">Call</a><a class="btn sm" style="display:inline-flex;background:#fff;color:#0f172a" target="_blank" rel="noopener" href="https://wa.me/${d}">WhatsApp</a></div>`}
window.dispatchEvent(new Event('settings-loaded'));return s}catch(e){console.error(e);return null}}
if('serviceWorker'in navigator)addEventListener('load',()=>navigator.serviceWorker.register('service-worker.js').catch(()=>{}));

// Handle broken product image URLs without a broken-image icon.
document.addEventListener('error',e=>{const img=e.target;if(!(img instanceof HTMLImageElement)||!img.closest('.pi'))return;const placeholder=document.createElement('span');placeholder.className='missing-photo';placeholder.innerHTML=ic('box')+'Image unavailable';img.replaceWith(placeholder)},true);

// Keyboard access for product cards, without intercepting nested controls.
document.addEventListener('keydown',e=>{if(!['Enter',' '].includes(e.key)||!e.target.matches('[data-open]'))return;e.preventDefault();openProduct(e.target.dataset.open)});
