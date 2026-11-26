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
  if(new URLSearchParams(location.search).get('checkout')==='1'){location.replace('cart.html');return;}
  const orders=await Customer.orders(profile.id);
  box.innerHTML=`<form class="card" id="profile"><label class="field"><span>Full name</span><input class="in" name="full_name" required maxlength="100" value="${esc(profile.full_name)}"></label><button class="btn dark">Save profile</button><button class="btn" type="button" id="logout">Sign out</button></form><h2 class="mt">Order history</h2><p class="help">Orders placed while signed in. Earlier guest orders remain in My orders.</p>${orders.map(o=>`<article class="card mt"><div class="between"><strong>#${esc(o.order_number)}</strong><span>${money(o.total)}</span></div><p>${esc(o.status.replaceAll('_',' '))} ${esc(o.fulfillment_step||'')}</p><p class="muted">${esc(fmtDate(o.created_at))}</p>${o.order_items.map(i=>`<p>${esc(i.product_name)} × ${i.quantity}</p>`).join('')}</article>`).join('')||'<p class="empty">No account orders yet.</p>'}`;
  $('#profile').onsubmit=e=>{e.preventDefault();withBusy(e.submitter,async()=>{try{await Customer.saveName(profile.id,e.target.elements.full_name.value.trim());toast('Profile saved')}catch(e){toast(errMsg(e),'bad')}})};
  $('#logout').onclick=async()=>{await Auth.signOut();await renderAccount()};
 }else{
  let mode='login',email='',googleEnabled=false;
  const returnTo=new URLSearchParams(location.search).get('checkout')==='1';
  const callback=new URL('account.html',location.href);if(returnTo)callback.searchParams.set('checkout','1');
  function draw(){
   const signup=mode==='signup',reset=mode==='reset';
   box.innerHTML='<form class="card" id="account-form"><h2>'+ (reset?'Reset password':signup?'Create account':'Welcome to FZ Cart')+'</h2>'+(!signup&&!reset&&googleEnabled?'<button type="button" class="btn wide" id="google-login"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M21 12c0-1-.1-2-.3-3H12v4h5a5 5 0 1 1-1-5l3-3A9 9 0 1 0 21 12Z"/></svg> Continue with Google</button>':'')+'<label class="field"><span>Email</span><input class="in" name="email" type="email" autocomplete="email" required></label>'+(!reset?'<label class="field"><span>Password</span><input class="in" name="password" type="password" autocomplete="'+(signup?'new-password':'current-password')+'" minlength="8" required></label><button type="button" class="btn" id="toggle-password">Show password</button>':'')+(signup?'<label class="field"><span>Full name</span><input class="in" name="full_name" maxlength="100" autocomplete="name" required></label>':'')+'<p id="auth-message" role="status"></p><div class="row" style="flex-wrap:wrap"><button class="btn dark">'+(reset?'Send reset link':signup?'Create account':'Sign in')+'</button>'+(mode==='login'?'<button type="button" class="btn" id="signup-mode">Create account</button><button type="button" class="btn" id="reset-mode">Forgot password?</button>':'<button type="button" class="btn" id="login-mode">Back to sign in</button>')+'</div></form>';
   const form=$('#account-form');form.elements.email.value=email;
   const change=m=>{email=form.elements.email.value;mode=m;draw()};
   if($('#signup-mode'))$('#signup-mode').onclick=()=>change('signup');
   if($('#reset-mode'))$('#reset-mode').onclick=()=>change('reset');
   if($('#login-mode'))$('#login-mode').onclick=()=>change('login');
   if($('#toggle-password'))$('#toggle-password').onclick=e=>{const p=form.elements.password;p.type=p.type==='password'?'text':'password';e.currentTarget.textContent=p.type==='password'?'Show password':'Hide password'};
   if($('#google-login'))$('#google-login').onclick=e=>withBusy(e.currentTarget,async()=>{try{throwIfError(await sb.auth.signInWithOAuth({provider:'google',options:{redirectTo:callback.href}}))}catch(err){$('#auth-message').textContent=errMsg(err)}});
   form.onsubmit=e=>{e.preventDefault();const f=form.elements;withBusy(e.submitter,async()=>{try{if(reset){throwIfError(await sb.auth.resetPasswordForEmail(f.email.value.trim(),{redirectTo:callback.href}));$('#auth-message').textContent='If an account exists, a password reset link will arrive by email.'}else if(signup){const result=throwIfError(await sb.auth.signUp({email:f.email.value.trim(),password:f.password.value,options:{data:{full_name:f.full_name.value.trim()},emailRedirectTo:callback.href}}));if(result?.session){await renderAccount();return}$('#auth-message').textContent='Check your email to confirm your account, then sign in.'}else{await Customer.signIn(f.email.value.trim(),f.password.value);await renderAccount()}}catch(err){$('#auth-message').textContent=errMsg(err)}})};
  }
  try{const response=await fetch(SUPABASE_URL+'/auth/v1/settings',{headers:{apikey:SUPABASE_ANON_KEY}});if(response.ok)googleEnabled=(await response.json()).external?.google===true}catch{}
  draw();
 }
 }catch(e){box.innerHTML=`<p class="msg bad">${esc(errMsg(e))}</p><button class="btn" id="retry-account">Retry</button>`;$('#retry-account').onclick=renderAccount}
}
renderAccount();
