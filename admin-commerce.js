/* V8 business controls. All writes are protected by database RLS. */
Tabs.push({key:'promotions',order:5,label:'Promotions',ico:'<i class="i i-tag"></i>',async render(el){
 const [s,coupons]=await Promise.all([Shop.settings(),sb.from('coupons').select('*').order('code').then(throwIfError)]);
 el.innerHTML=`<section class="card"><h2>Delivery</h2><form id="delivery"><div class="form-grid"><label class="field">Delivery charge (AED)<input class="input" name="charge" type="number" min="0" step="0.01" required value="${esc(s.delivery_charge)}"></label><label class="field">Free delivery from (AED, optional)<input class="input" name="free" type="number" min="0" step="0.01" value="${esc(s.free_delivery_above)}"></label></div><button class="btn btn-primary">Save delivery</button></form></section>
 <section class="card mt"><h2>Coupons</h2><form id="coupon-form"><div class="form-grid"><label class="field">Code<input class="input" name="code" pattern="[A-Za-z0-9_-]{3,32}" required maxlength="32"></label><label class="field">Type<select class="input" name="kind"><option value="percent">Percentage</option><option value="fixed">Fixed AED</option></select></label><label class="field">Value<input class="input" name="value" type="number" min="0.01" step="0.01" required></label><label class="field">Minimum subtotal<input class="input" name="minimum" type="number" min="0" step="0.01" value="0" required></label><label class="field">Maximum redemptions<input class="input" name="max" type="number" min="1" step="1"></label><label class="field">Expires (local time)<input class="input" name="expires" type="datetime-local"></label></div><button class="btn btn-primary">Create coupon</button></form>
 <div class="table-wrap mt"><table><thead><tr><th>Code</th><th>Offer</th><th>Uses</th><th>Availability</th></tr></thead><tbody>${coupons.map(c=>`<tr><td>${esc(c.code)}</td><td>${esc(c.value)} ${c.kind==='percent'?'%':'AED'}</td><td>${c.uses}${c.max_uses?'/'+c.max_uses:''}</td><td><button class="btn btn-sm" data-code="${esc(c.code)}" data-active="${c.active}">${c.active?'Disable':'Enable'}</button></td></tr>`).join('')}</tbody></table></div></section>`;
 $('#delivery').onsubmit=e=>{e.preventDefault();const f=e.target.elements;withBusy(e.submitter,async()=>{try{throwIfError(await sb.from('business_settings').update({delivery_charge:Number(f.charge.value),free_delivery_above:f.free.value===''?null:Number(f.free.value)}).eq('id',1));toast('Delivery updated','success')}catch(e){toast(errMsg(e),'error')}})};
 $('#coupon-form').onsubmit=e=>{e.preventDefault();const f=e.target.elements;withBusy(e.submitter,async()=>{try{throwIfError(await sb.from('coupons').insert({code:f.code.value.trim().toUpperCase(),kind:f.kind.value,value:Number(f.value.value),minimum_order:Number(f.minimum.value),max_uses:f.max.value?Number(f.max.value):null,expires_at:f.expires.value?new Date(f.expires.value).toISOString():null}));showTab('promotions')}catch(e){toast(errMsg(e),'error')}})};
 el.onclick=e=>{const b=e.target.closest('[data-code]');if(b)withBusy(b,async()=>{try{throwIfError(await sb.from('coupons').update({active:b.dataset.active!=='true'}).eq('code',b.dataset.code));showTab('promotions')}catch(e){toast(errMsg(e),'error')}})};
}});
Tabs.push({key:'customers',order:6,label:'Customers',ico:'<i class="i i-user"></i>',async render(el){
 const rows=throwIfError(await sb.from('profiles').select('id,full_name,role,created_at').order('created_at',{ascending:false}).limit(200));
 el.innerHTML=`<section class="card"><h2>Registered customers</h2><p class="help">Latest 200 accounts. Contact and delivery details are available on their orders.</p><div class="table-wrap"><table><thead><tr><th>Name</th><th>Role</th><th>Joined</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.full_name||'Unnamed account')}</td><td>${esc(r.role)}</td><td>${esc(fmtDate(r.created_at))}</td></tr>`).join('')}</tbody></table></div></section>`;
}});
Tabs.push({key:'audit',order:7,label:'Activity log',ico:'<i class="i i-shield"></i>',async render(el){
 const rows=throwIfError(await sb.from('audit_logs').select('*').order('created_at',{ascending:false}).limit(200));
 el.innerHTML=`<section class="card"><h2>Activity log</h2><p class="help">Latest 200 events. Field names only; private customer values are not copied into logs.</p><div class="table-wrap audit-scroll" tabindex="0" role="region" aria-label="Activity log events"><table><thead><tr><th>Time</th><th>Action</th><th>Record</th><th>Changed fields</th><th>Actor</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(fmtDate(r.created_at))}</td><td>${esc(r.action)}</td><td>${esc(r.entity)}<br><small>${esc(r.entity_id)}</small></td><td>${esc(r.changed_fields.join(', '))}</td><td>${esc(r.actor_id||'Guest / system')}</td></tr>`).join('')}</tbody></table></div></section>`;
}});

// Wikimedia Commons is a free licensed source. Candidates stay unpublished until approved.
async function findLicensedImages(query,host,onApprove){
 host.innerHTML='<p role="status">Searching Wikimedia Commons…</p>';
 try{
 const url=new URL('https://commons.wikimedia.org/w/api.php');
 Object.entries({action:'query',format:'json',origin:'*',generator:'search',gsrsearch:query,gsrnamespace:6,gsrlimit:8,prop:'imageinfo',iiprop:'url|extmetadata',iiurlwidth:500}).forEach(([k,v])=>url.searchParams.set(k,v));
 const response=await fetch(url);if(!response.ok)throw Error('Image source is unavailable');
 const data=await response.json();
 const candidates=Object.values(data.query?.pages||{}).map(p=>p.imageinfo?.[0]).filter(i=>i&&/^https:\/\/upload.wikimedia.org\//.test(i.url)&&/^(CC0|Public domain)$/i.test(i.extmetadata?.LicenseShortName?.value||''));
 host.innerHTML='<p class="help">Only CC0 / public-domain candidates are shown. Verify the exact model and source rights before approving. Other licensed images can be uploaded manually.</p>'+ (candidates.length?candidates.map((c,i)=>`<div class="card"><img src="${esc(c.thumburl||c.url)}" alt="Candidate ${i+1}" width="140" loading="lazy"><a href="${esc(c.descriptionurl)}" target="_blank" rel="noopener noreferrer">Review source and rights</a><button type="button" class="btn" data-approve="${i}">Approve image for this product</button></div>`).join(''):'<p>No public-domain matches. Upload your own authorized product photo.</p>');
 host.onclick=e=>{const b=e.target.closest('[data-approve]');if(b){const c=candidates[Number(b.dataset.approve)];onApprove(c.url);b.disabled=true;b.textContent='Approved — save product to publish'}};
 }catch(e){host.textContent=errMsg(e)+'. Upload an authorized image instead.'}
}
function parseAttributes(text){
 const entries=text.split('\n').map(line=>line.trim()).filter(Boolean).map(line=>{
 const split=line.indexOf(':');if(split<1)throw Error('Use Attribute: Value, one per line');
 const key=line.slice(0,split).trim(),value=line.slice(split+1).trim();
 if(!value||key.length>40||value.length>100)throw Error('Attributes need a name (up to 40 characters) and value (up to 100 characters)');
 return [key,value];
 });
 if(new Set(entries.map(([k])=>k.toLowerCase())).size!==entries.length)throw Error('Attribute names must be unique');
 return Object.fromEntries(entries);
}
