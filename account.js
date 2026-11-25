renderSiteHeader('account');
applyBusinessSettings();
let recovery=location.hash.includes('type=recovery');
const accountUrl=new URL('account.html',location.href).href;
async function showGoogleSignIn(button) {
 try {
  const response=await fetch(SUPABASE_URL+'/auth/v1/settings',{headers:{apikey:SUPABASE_ANON_KEY}});
  if(response.ok && (await response.json()).external?.google===true) button.closest('.auth-provider').hidden=false;
 } catch {
  // Email sign-in remains available when provider settings cannot be loaded.
 }
}
sb.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){recovery=false;$('#account').replaceChildren();setTimeout(renderAccount,0)}if(event==='PASSWORD_RECOVERY'){recovery=true;setTimeout(renderAccount,0)}});
async function renderAccount() {
 const box=$('#account'); box.innerHTML='<p>Loading your account…</p>';
 try {
 const profile=await Customer.profile();
 if(profile&&recovery){
 box.innerHTML='<form id="reset-password" class="card auth-card"><h1>Choose a new password</h1><label class="field">New password<input class="in" name="password" type="password" minlength="8" autocomplete="new-password" required></label><button class="btn dark">Save password</button></form>';
 $('#reset-password').onsubmit=e=>{e.preventDefault();withBusy(e.submitter,async()=>{try{throwIfError(await sb.auth.updateUser({password:e.target.elements.password.value}));recovery=false;history.replaceState(null,'',location.pathname);toast('Password updated');await renderAccount()}catch(e){toast(errMsg(e),'bad')}})};
 return;
 }
 if(profile){
  const orders=await Customer.orders(profile.id);
  box.innerHTML=`<h1>My account</h1><form class="card mt" id="profile"><label class="field"><span>Full name</span><input class="in" name="full_name" required maxlength="100" value="${esc(profile.full_name)}"></label><button class="btn dark">Save profile</button><button class="btn" type="button" id="logout">Sign out</button></form><h2 class="mt">Order history</h2><p class="help">Orders placed while signed in. Earlier guest orders remain in My orders.</p>${orders.map(o=>`<article class="card mt"><div class="between"><strong>#${esc(o.order_number)}</strong><span>${money(o.total)}</span></div><p>${esc(o.status.replaceAll('_',' '))} ${esc(o.fulfillment_step||'')}</p><p class="muted">${esc(fmtDate(o.created_at))}</p>${o.order_items.map(i=>`<p>${esc(i.product_name)} × ${i.quantity}</p>`).join('')}</article>`).join('')||'<p class="empty">No account orders yet.</p>'}`;
  $('#profile').onsubmit=e=>{e.preventDefault();withBusy(e.submitter,async()=>{try{await Customer.saveName(profile.id,e.target.elements.full_name.value.trim());toast('Profile saved')}catch(e){toast(errMsg(e),'bad')}})};
  $('#logout').onclick=async()=>{await Auth.signOut();await renderAccount()};
 }else{
  renderSignIn(box);
 }
 }catch(e){box.innerHTML=`<p class="msg bad">${esc(errMsg(e))}</p><button class="btn" id="retry-account">Retry</button>`;$('#retry-account').onclick=renderAccount}
}
const googleMark = `<svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
 <path fill="#4285F4" d="M43.61 24.46c0-1.36-.12-2.66-.35-3.91H24v7.41h11a9.4 9.4 0 0 1-4.08 6.17v5.13h6.61c3.87-3.56 6.08-8.81 6.08-14.8Z"/>
 <path fill="#34A853" d="M24 44c5.51 0 10.13-1.83 13.51-4.74l-6.61-5.13c-1.83 1.22-4.17 1.93-6.9 1.93-5.32 0-9.83-3.59-11.44-8.42H5.74v5.29A20 20 0 0 0 24 44Z"/>
 <path fill="#FBBC05" d="M12.56 27.64a12 12 0 0 1 0-7.28v-5.29H5.74a20 20 0 0 0 0 17.86l6.82-5.29Z"/>
 <path fill="#EA4335" d="M24 11.94c3 0 5.69 1.03 7.81 3.06l5.86-5.86C34.12 5.83 29.5 4 24 4A20 20 0 0 0 5.74 15.07l6.82 5.29C14.17 15.53 18.68 11.94 24 11.94Z"/>
</svg>`;

function renderSignIn(box, mode='login', email='') {
 const register=mode==='register';
 const reset=mode==='reset';
 const login=mode==='login';
 const title=register?'Create account':reset?'Reset password':'Sign in';
 box.innerHTML=`<section class="card auth-card" aria-labelledby="auth-title">
  <h1 id="auth-title" tabindex="-1">${title}</h1>
  ${reset?'':`<div class="auth-provider" hidden>
   <button class="btn auth-google" type="button" id="google-sign-in">${googleMark}<span>Continue with Google</span></button>
   <div class="auth-divider">or use email</div>
  </div>`}
  <form id="account-form">
   ${register?'<label class="field"><span>Full name</span><input class="in" name="full_name" maxlength="100" autocomplete="name" required></label>':''}
   <label class="field"><span>Email</span><input class="in" name="email" type="email" autocomplete="email" required></label>
   ${reset?'':`<div class="field"><label for="auth-password">Password</label><span class="auth-password"><input class="in" id="auth-password" name="password" type="password" ${register?'minlength="8"':''} autocomplete="${register?'new-password':'current-password'}" required><button class="auth-link" type="button" id="toggle-password">Show</button></span></div>`}
   ${login?'<button class="auth-link auth-forgot" type="button" data-mode="reset">Forgot password?</button>':''}
   <p id="auth-message" class="auth-message" role="status"></p>
   <button class="btn dark auth-submit" type="submit">${reset?'Send reset link':title}</button>
  </form>
  <div class="auth-switch">${login?'New to FZ Cart? <button class="auth-link" type="button" data-mode="register">Create account</button>':'<button class="auth-link" type="button" data-mode="login">Back to sign in</button>'}</div>
 </section>`;
 const form=$('#account-form');
 const message=$('#auth-message');
 form.elements.email.value=email;
 box.querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>{
  renderSignIn(box,button.dataset.mode,form.elements.email.value);
  $('#auth-title').focus();
 });

 const toggle=$('#toggle-password');
 if(toggle) toggle.onclick=()=>{
  const show=form.elements.password.type==='password';
  form.elements.password.type=show?'text':'password';
  toggle.textContent=show?'Hide':'Show';
  toggle.setAttribute('aria-label',show?'Hide password':'Show password');
 };
 toggle?.setAttribute('aria-label','Show password');

 const google=$('#google-sign-in');
 if(google){
  google.onclick=()=>withBusy(google,async()=>{
   message.textContent='';
   try {
    throwIfError(await sb.auth.signInWithOAuth({provider:'google',options:{redirectTo:accountUrl}}));
   } catch(error) { message.textContent=errMsg(error); }
  });
  void showGoogleSignIn(google);
 }

 form.onsubmit=event=>{
  event.preventDefault();
  const fields=form.elements;
  const address=fields.email.value.trim();
  withBusy(event.submitter,async()=>{
   message.textContent='';
   try {
    if(reset){
     throwIfError(await sb.auth.resetPasswordForEmail(address,{redirectTo:accountUrl}));
     message.textContent='If an account exists, a password reset link will arrive by email.';
    }else if(register){
     await Customer.signUp(address,fields.password.value,fields.full_name.value.trim());
     message.textContent='Check your email to confirm your account, then sign in.';
    }else{
     await Customer.signIn(address,fields.password.value);
     await renderAccount();
    }
   } catch(error) { message.textContent=errMsg(error); }
  });
 };
}

renderAccount();
