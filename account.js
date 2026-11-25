renderSiteHeader('account');
applyBusinessSettings();
let recovery=location.hash.includes('type=recovery');
sb.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){recovery=false;$('#account').replaceChildren();setTimeout(renderAccount,0)}if(event==='PASSWORD_RECOVERY'){recovery=true;setTimeout(renderAccount,0)}});
async function renderAccount() {
 const box=$('#account'); box.innerHTML='<p>Loading your account…</p>';
 try {
 const profile=await Customer.profile();
 if(profile&&recovery){
 box.innerHTML='<form id="reset-password" class="card"><h2>Choose a new password</h2><label class="field">New password<input class="in" name="password" type="password" minlength="8" autocomplete="new-password" required></label><button class="btn dark">Save password</button></form>';
 $('#reset-password').onsubmit=e=>{e.preventDefault();withBusy(e.submitter,async()=>{try{throwIfError(await sb.auth.updateUser({password:e.target.elements.password.value}));recovery=false;history.replaceState(null,'',location.pathname);toast('Password updated');await renderAccount()}catch(e){toast(errMsg(e),'bad')}})};
 return;
 }
 if(profile){
  const orders=await Customer.orders(profile.id);
  box.innerHTML=`<form class="card" id="profile"><label class="field"><span>Full name</span><input class="in" name="full_name" required maxlength="100" value="${esc(profile.full_name)}"></label><button class="btn dark">Save profile</button><button class="btn" type="button" id="logout">Sign out</button></form><h2 class="mt">Order history</h2><p class="help">Orders placed while signed in. Earlier guest orders remain in My orders.</p>${orders.map(o=>`<article class="card mt"><div class="between"><strong>#${esc(o.order_number)}</strong><span>${money(o.total)}</span></div><p>${esc(o.status.replaceAll('_',' '))} ${esc(o.fulfillment_step||'')}</p><p class="muted">${esc(fmtDate(o.created_at))}</p>${o.order_items.map(i=>`<p>${esc(i.product_name)} × ${i.quantity}</p>`).join('')}</article>`).join('')||'<p class="empty">No account orders yet.</p>'}`;
  $('#profile').onsubmit=e=>{e.preventDefault();withBusy(e.submitter,async()=>{try{await Customer.saveName(profile.id,e.target.elements.full_name.value.trim());toast('Profile saved')}catch(e){toast(errMsg(e),'bad')}})};
  $('#logout').onclick=async()=>{await Auth.signOut();await renderAccount()};
 }else{
  box.innerHTML=`<form class="card" id="account-form"><h2>Welcome to FZ Cart</h2><label class="field"><span>Email</span><input class="in" name="email" type="email" autocomplete="email" required></label><label class="field"><span>Password</span><input class="in" name="password" type="password" autocomplete="current-password" minlength="8" required></label><label class="field"><span>Full name (for new accounts)</span><input class="in" name="full_name" maxlength="100" autocomplete="name"></label><p id="auth-message" role="status"></p><div class="row"><button class="btn dark" name="action" value="login">Sign in</button><button class="btn" name="action" value="register">Create account</button><button class="btn" type="button" id="forgot-password">Forgot password</button></div></form>`;
  $('#forgot-password').onclick=e=>withBusy(e.currentTarget,async()=>{const email=$('#account-form').elements.email;if(!email.reportValidity())return;try{throwIfError(await sb.auth.resetPasswordForEmail(email.value.trim(),{redirectTo:new URL('account.html',location.href).href}));$('#auth-message').textContent='If an account exists, a password reset link will arrive by email.'}catch(err){$('#auth-message').textContent=errMsg(err)}});
  $('#account-form').onsubmit=e=>{e.preventDefault();const f=e.target.elements,register=e.submitter.value==='register';withBusy(e.submitter,async()=>{try{if(register){await Customer.signUp(f.email.value.trim(),f.password.value,f.full_name.value.trim());$('#auth-message').textContent='Check your email to confirm your account, then sign in.'}else{await Customer.signIn(f.email.value.trim(),f.password.value);await renderAccount()}}catch(err){$('#auth-message').textContent=errMsg(err)}})};
 }
 }catch(e){box.innerHTML=`<p class="msg bad">${esc(errMsg(e))}</p><button class="btn" id="retry-account">Retry</button>`;$('#retry-account').onclick=renderAccount}
}
renderAccount();
