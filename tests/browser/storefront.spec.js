const {test,expect}=require('@playwright/test');
const id='10000000-0000-0000-0000-000000000001';
const product={id,name:'Phone Pro',description:'A test product',brand:'FZ',sku:'PHONE-1',selling_price:100,compare_at_price:120,category_name:'Phones',category_id:null,stock_status:'in_stock',images:[],attributes:{colour:'Black'},variant_group:null};
async function signInFixture(page){
 const exp=Math.floor(Date.now()/1000)+3600;
 const token=[{alg:'HS256',typ:'JWT'},{sub:id,exp},'test-only'].map(value=>Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
 await page.addInitScript(({id,exp,token})=>{
  const key='sb-gcmudhejegesvwdpkkdy-auth-token';
  if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify({access_token:token,refresh_token:'test-only',expires_at:exp,user:{id,aud:'authenticated',role:'authenticated',user_metadata:{}}}));
 },{id,exp,token});
}
async function mock(page){
 await page.route('https://gcmudhejegesvwdpkkdy.supabase.co/**',async route=>{
 const u=route.request().url();let body=[];
 if(u.includes('business_settings'))body={id:1,business_name:'FZ Cart',currency:'AED',delivery_charge:10};
 else if(u.includes('public_products'))body=u.includes('id=eq.')?product:[product];
 else if(u.includes('quote_order'))body={subtotal:100,discount_total:0,delivery_charge:10,total:110};
 else if(u.includes('checkout_v8'))body={order_id:id,order_number:1001,total:110,duplicate:false};
 else if(u.includes('track_orders'))body=[{order_number:1001,status:'pending',total:110,items:[]}];
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
}
for(const width of [375,390,768,1440])test(`catalogue, gallery and responsive layout at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});await mock(page);await signInFixture(page);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/products.html');await expect(page.getByRole('heading',{name:'Phone Pro'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`test-results/storefront-${width}.png`,fullPage:true});
 await page.getByRole('button',{name:'Phone Pro',exact:true}).press('Enter');await expect(page.getByRole('dialog')).toBeVisible();
 await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();
 await page.getByRole('button',{name:'Switch to dark mode'}).click();await expect(page.locator('html')).toHaveAttribute('data-shop-theme','dark');
 await page.getByRole('button',{name:'Add',exact:true}).click();await expect(page.locator('[data-card-count]').first()).toHaveText('1');await page.goto('/cart.html');
 await expect(page.locator('#co')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('[name=name]').fill('Test Customer');await page.getByRole('button',{name:'More',exact:true}).click();
 await expect(page.locator('.qty span')).toHaveText('2');
 await expect(page.locator('[name=name]')).toHaveValue('Test Customer');
 await page.locator('[name=phone]').fill('+971501234567');
 await page.getByRole('button',{name:'Place order',exact:true}).click();await expect(page.getByRole('dialog')).toHaveAccessibleName('Order Confirmed');
 await expect(page.getByRole('dialog')).toContainText(/order #1001\b/i);expect(errors).toEqual([]);
});
test('account and admin reject unauthenticated access without private data',async({page})=>{
 await mock(page);await page.goto('/account.html');await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible();
 await page.goto('/admin.html');await expect(page.locator('#login-view')).toBeVisible();await expect(page.locator('#app-view')).not.toBeVisible();
});
test('filters are applied on the server query',async({page})=>{
 await mock(page);await page.goto('/products.html');await page.getByText('Filters',{exact:true}).click();await page.locator('#min-price').fill('50');await page.locator('#max-price').fill('150');await page.locator('#in-stock').check();
 const request=page.waitForRequest(r=>r.url().includes('selling_price=gte.50')&&r.url().includes('selling_price=lte.150')&&r.url().includes('stock_status=neq.out_of_stock'));
 await page.getByRole('button',{name:'Apply filters'}).click();await request;
});
test('variant selection and coupon errors preserve checkout input',async({page})=>{
 await mock(page);await signInFixture(page);
 await page.route('**/rest/v1/public_products*',route=>{
 const p={...product,variant_group:'phone',images:['/icons/icon-192.png']};
 const p2={...p,id:'10000000-0000-0000-0000-000000000002',name:'Phone Silver',attributes:{colour:'Silver'}};
 const url=route.request().url();const rows=(url.includes('variant_group=eq.')||url.includes('id=in.'))?[p,p2]:url.includes('id=eq.')?p2:[p];
 return route.fulfill({contentType:'application/json',body:JSON.stringify(rows)});
 });
 await page.goto('/products.html');await page.getByRole('button',{name:'Phone Pro',exact:true}).click();
 await expect(page.locator('#variant-select')).toBeVisible();await page.locator('#variant-select').selectOption('10000000-0000-0000-0000-000000000002');
 await expect(page.getByRole('heading',{name:'Phone Silver'})).toBeVisible();await page.getByRole('button',{name:'Toggle image zoom'}).click();await expect(page.locator('#pd-img')).toHaveClass('zoomed');
 await page.getByRole('button',{name:'Add to cart'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await page.goto('/cart.html');await page.locator('[name=name]').fill('Keep My Name');
 await page.route('**/rest/v1/rpc/quote_order',route=>route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:'Coupon is invalid, expired or minimum order not reached'})}));
 await page.locator('#coupon').fill('WRONG');await page.locator('#apply-coupon').click();await expect(page.locator('#co-btn')).toBeDisabled();await expect(page.locator('[name=name]')).toHaveValue('Keep My Name');
});
test('catalogue treats malicious product text as text',async({page})=>{
 await mock(page);await page.route('**/rest/v1/public_products*',route=>route.fulfill({contentType:'application/json',body:JSON.stringify([{...product,name:'<img src=x onerror=alert(1)>'}])}));
 let dialogs=0;page.on('dialog',d=>{dialogs++;d.dismiss()});await page.goto('/products.html');await expect(page.locator('.pt')).toContainText('<img src=x onerror=alert(1)>');expect(await page.locator('.pt img').count()).toBe(0);expect(dialogs).toBe(0);
});

test('mobile account separates Google, email signup and password recovery', async ({page}) => {
 await page.setViewportSize({width:390,height:844});
 await mock(page);
 await page.route('**/auth/v1/settings',route=>route.fulfill({json:{external:{google:true}}}));
 await page.goto('/account.html');
 const google=page.getByRole('button',{name:'Continue with Google'});
 await expect(google).toBeVisible();
 await expect(google.locator('svg')).toHaveCount(1);
 await expect(page.getByLabel('Full name')).toHaveCount(0);
 await page.getByLabel('Email',{exact:true}).fill('customer@example.com');
 await page.getByRole('button',{name:'Show password'}).click();
 await expect(page.getByLabel('Password',{exact:true})).toHaveAttribute('type','text');
 await page.getByRole('button',{name:'Create account',exact:true}).click();
 await expect(page.getByLabel('Full name')).toBeVisible();
 await expect(page.getByLabel('Email',{exact:true})).toHaveValue('customer@example.com');
 await page.getByRole('button',{name:'Back to sign in'}).click();
 await page.getByRole('button',{name:'Forgot password?'}).click();
 await expect(page.getByRole('button',{name:'Send reset link'})).toBeVisible();
 await expect(page.getByLabel('Password',{exact:true})).toHaveCount(0);
 await expect(page.getByLabel('Email',{exact:true})).toHaveValue('customer@example.com');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('order tracking validates input, saves a match and removes it locally', async ({page}) => {
 await mock(page);
 await page.route('**/rest/v1/rpc/track_orders', route => {
  const known = route.request().postDataJSON().p_lookups.some(({n,p})=>n==='1001' && p==='+971500000000');
  return route.fulfill({json:known?[{order_number:1001,status:'processing',step:'packed',total:110,items:[{name:'Phone Pro',qty:1}]}]:[]});
 });
 await page.goto('/orders.html');
 const form=page.locator('#lookup');
 const submit=form.getByRole('button',{name:'Track order'});
 await submit.click();
 await expect(form.locator('#lookup-err')).toHaveText('Enter the order number and your phone number.');
 await form.getByLabel('Order number').fill('1001');
 await form.getByLabel('Phone number').fill('+971500000001');
 await submit.click();
 await expect(form.locator('#lookup-err')).toHaveText('No order found. Check the number and phone.');
 await form.getByLabel('Phone number').fill('+971500000000');
 await submit.click();
 const card=page.locator('.order-card');
 await expect(card).toContainText('Order #1001');
 await expect(card.locator('.current')).toContainText('Packed');
 await page.reload();
 await expect(card).toContainText('Order #1001');
 await card.getByRole('button',{name:'Remove from list'}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Remove',exact:true}).click();
 await expect(card).toHaveCount(0);
});
