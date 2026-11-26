renderSiteHeader('cart');
const box=$('#cart');let lines=[],renderVersion=0,submitting=false,refreshing=false,draft=null,coupon='',quote=null;
const lineHtml=l=>{const p=l.product,im=(p.images||[])[0],o=stockOf(p)==='out';
return `<div class="cl" data-id="${esc(l.product_id)}">${im?`<img src="${esc(im)}" alt="${esc(p.name)}">`:`<div class="ph">${ic('box')}</div>`}<div class="info"><b>${esc(p.name)}</b><span class="small muted">${money(p.selling_price)} each</span>${o?'<div class="small" style="color:var(--bad);font-weight:600">Out of stock. Remove it to continue.</div>':''}<br><button class="rm" data-rm>Remove</button></div><div style="text-align:right"><div class="qty"><button data-q="-1" aria-label="Less">${ic('minus')}</button><span>${l.quantity}</span><button data-q="1" aria-label="More" ${o||l.quantity>=999?'disabled':''}>${ic('plus')}</button></div><div class="price" style="margin-top:6px">${money(l.quantity*Number(p.selling_price))}</div></div></div>`};
function saved(){try{return JSON.parse(localStorage.getItem('cust_v1'))||{}}catch{return{}}}
function captureDraft(){const f=$('#co');if(f)draft={name:f.elements.name.value,phone:f.elements.phone.value,address:f.elements.address.value};}
async function render(){
const version=++renderVersion;captureDraft();refreshing=true;if($('#co-btn'))$('#co-btn').disabled=true;
let items=Shop.cart.get();
if(!items.length){box.innerHTML=emptyHtml('bag','Your cart is empty','Add something you like and it will wait here.','<a class="btn dark" href="products.html">Browse products</a>');return}
try{const next=await Shop.cartDetails();if(version!==renderVersion)return;lines=next}catch(e){if(version!==renderVersion)return;console.error(e);box.innerHTML=emptyHtml('alert','Could not load your cart','Please try again.','<button class="btn" id="retry-cart">Retry</button>');return}
if(!lines.length){Shop.cart.clear();box.innerHTML=emptyHtml('bag','Your cart is empty','The products in it are no longer available.','<a class="btn dark" href="products.html">Browse products</a>');return}
let session=null;try{session=await Auth.getSession()}catch{}if(version!==renderVersion)return;
if(!session||session.user?.is_anonymous){refreshing=false;box.innerHTML='<div class="cart"><div>'+lines.map(lineHtml).join('')+'</div><section class="card"><h2>Sign in to check out</h2><p class="help">Your cart will be kept while you sign in.</p><a class="btn dark wide" href="account.html?checkout=1">Sign in</a></section></div>';return}
let pricingError='';try{quote=await Shop.quote(coupon)}catch(e){pricingError=errMsg(e);quote=null}if(version!==renderVersion)return;
captureDraft();
const missing=items.length!==lines.length;
const total=lines.reduce((s,l)=>s+l.quantity*Number(l.product.selling_price),0),blocked=!!pricingError||missing||lines.some(l=>stockOf(l.product)==='out'),c=draft||saved();
refreshing=false;
box.innerHTML=`<div class="cart"><div>${lines.map(lineHtml).join('')}</div>
<form class="card" id="co" novalidate>${missing?'<p class="msg bad">Some items are no longer available. <button type="button" class="btn sm" id="remove-missing">Remove unavailable items</button></p>':''}<h2 style="font-size:16px;margin-bottom:10px">Send your order</h2>
<div class="sum"><span class="muted">Items</span><span>${lines.reduce((n,l)=>n+l.quantity,0)}</span></div>
<label class="field"><span>Coupon code</span><div class="row"><input class="in" id="coupon" maxlength="32" value="${esc(coupon)}"><button class="btn" id="apply-coupon" type="button">Apply</button></div></label>
<div class="sum"><span>Subtotal</span><span>${money(total)}</span></div><div class="sum"><span>Discount</span><span>−${money(quote?.discount_total||0)}</span></div><div class="sum"><span>Delivery</span><span>${quote?money(quote.delivery_charge):'Unavailable'}</span></div><div class="sum t"><span>Total</span><span>${quote?money(quote.total):'Unavailable'}</span></div>${pricingError?`<p class="msg bad">${esc(pricingError)} <button class="btn" type="button" id="retry-cart">Retry</button></p>`:''}
<p class="help">Prices and stock are checked securely when you place your order. No online payment is needed.</p>
<label class="field"><span>Full name</span><input class="in" name="name" autocomplete="name" maxlength="100" value="${esc(c.name||'')}" placeholder="Your name"></label>
<label class="field"><span>Phone number</span><input class="in" name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="20" value="${esc(c.phone||'')}" placeholder="+971 50 123 4567"></label>
<label class="field"><span>Delivery address (optional)</span><input class="in" name="address" autocomplete="street-address" maxlength="300" value="${esc(c.address||'')}" placeholder="Area, street, building"></label>
<div class="err" id="co-err" hidden></div>
<button class="btn dark wide" type="submit" id="co-btn" ${blocked?'disabled':''}>Place order</button></form></div>`}
box.addEventListener('click',e=>{if(submitting)return;if(e.target.closest('#apply-coupon')){coupon=$('#coupon').value.trim().toUpperCase();render();return}if(e.target.closest('#retry-cart')){render();return}if(e.target.closest('#remove-missing')){Shop.cart.save(Shop.cart.get().filter(i=>lines.some(l=>l.product_id===i.product_id)));render();return}const row=e.target.closest('.cl');if(!row)return;const id=row.dataset.id,cur=(Shop.cart.get().find(i=>i.product_id===id)||{}).quantity||0;
if(e.target.closest('[data-rm]')){Shop.cart.remove(id);render()}
const q=e.target.closest('[data-q]');if(q&&!q.disabled){Shop.cart.setQty(id,cur+Number(q.dataset.q));render()}});
box.addEventListener('submit',async e=>{e.preventDefault();if(submitting||refreshing||e.target.id!=='co'||$('#co-btn').disabled)return;const f=e.target.elements,err=$('#co-err'),name=f.name.value.trim(),phone=f.phone.value.trim(),address=f.address.value.trim();err.hidden=true;
if(name.length<2){err.textContent='Please enter your name.';err.hidden=false;return}
if(phone.replace(/\D/g,'').length<6){err.textContent='Please enter a valid phone number.';err.hidden=false;return}
submitting=true;const controls=[...box.querySelectorAll('button,input')].filter(el=>!el.disabled&&el.id!=='co-btn');controls.forEach(el=>el.disabled=true);try{await withBusy($('#co-btn'),async()=>{try{const session=await Auth.getSession();if(!session||session.user?.is_anonymous){location.href='account.html?checkout=1';return}await Shop.placeOrder({name,phone,address,coupon});try{localStorage.setItem('cust_v1',JSON.stringify({name,phone,address}))}catch{}location.href='orders.html#placed'}catch(ex){err.textContent=errMsg(ex);err.hidden=false}})}finally{submitting=false;controls.forEach(el=>el.disabled=false)}});
window.addEventListener('storage',e=>{if(e.key===Shop.cart.KEY&&!submitting)render()});
applyBusinessSettings();render();
