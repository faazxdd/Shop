const {test,expect}=require('@playwright/test');
const id='10000000-0000-0000-0000-000000000001';
const product={id,name:'Phone Pro',description:'A test product',brand:'FZ',sku:'PHONE-1',selling_price:100,compare_at_price:120,category_name:'Phones',category_id:null,stock_status:'in_stock',images:[],attributes:{colour:'Black'},variant_group:null};
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
 await page.setViewportSize({width,height:900});await mock(page);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/products.html');await expect(page.getByRole('heading',{name:'Phone Pro'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`test-results/storefront-${width}.png`,fullPage:true});
 await page.getByRole('button',{name:'Phone Pro',exact:true}).press('Enter');await expect(page.getByRole('dialog')).toBeVisible();
 await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();
 await page.getByRole('button',{name:'Switch to dark mode'}).click();await expect(page.locator('html')).toHaveAttribute('data-shop-theme','dark');
 await page.getByRole('button',{name:'Add',exact:true}).click();await page.goto('/cart.html');
 await expect(page.locator('#co')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('[name=name]').fill('Test Customer');await page.getByRole('button',{name:'More',exact:true}).click();
 await expect(page.locator('.qty span')).toHaveText('2');
 await expect(page.locator('[name=name]')).toHaveValue('Test Customer');
 await page.locator('[name=phone]').fill('+971501234567');await page.locator('[name=address]').fill('Dubai');
 await page.getByRole('button',{name:'Place order',exact:true}).click();await expect(page).toHaveURL(/orders.html#placed/);
 await expect(page.getByRole('heading',{name:'Order sent'})).toBeVisible();expect(errors).toEqual([]);
});
test('account and admin reject unauthenticated access without private data',async({page})=>{
 await mock(page);await page.goto('/account.html');await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible();
 await page.goto('/admin.html');await expect(page.locator('#login-view')).toBeVisible();await expect(page.locator('#app-view')).not.toBeVisible();
});
test('filters are applied on the server query',async({page})=>{
 await mock(page);await page.goto('/products.html');await page.locator('#min-price').fill('50');await page.locator('#max-price').fill('150');await page.locator('#in-stock').check();
 const request=page.waitForRequest(r=>r.url().includes('selling_price=gte.50')&&r.url().includes('selling_price=lte.150')&&r.url().includes('stock_status=neq.out_of_stock'));
 await page.getByRole('button',{name:'Apply filters'}).click();await request;
});
test('variant selection and coupon errors preserve checkout input',async({page})=>{
 await mock(page);
 await page.route('**/rest/v1/public_products*',route=>{
 const p={...product,variant_group:'phone',images:['/icons/icon-192.png']};
 const p2={...p,id:'10000000-0000-0000-0000-000000000002',name:'Phone Silver',attributes:{colour:'Silver'}};
 const url=route.request().url();const rows=(url.includes('variant_group=eq.')||url.includes('id=in.'))?[p,p2]:url.includes('id=eq.')?p2:[p];
 return route.fulfill({contentType:'application/json',body:JSON.stringify(rows)});
 });
 await page.goto('/products.html');await page.getByRole('button',{name:'Phone Pro',exact:true}).click();
 await expect(page.locator('#variant-select')).toBeVisible();await page.locator('#variant-select').selectOption('10000000-0000-0000-0000-000000000002');
 await expect(page.getByRole('heading',{name:'Phone Silver'})).toBeVisible();await page.getByRole('button',{name:'Toggle image zoom'}).click();await expect(page.locator('#pd-img')).toHaveClass('zoomed');
 await page.getByRole('button',{name:'Add to cart'}).click();await page.goto('/cart.html');await page.locator('[name=name]').fill('Keep My Name');
 await page.route('**/rest/v1/rpc/quote_order',route=>route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:'Coupon is invalid, expired or minimum order not reached'})}));
 await page.locator('#coupon').fill('WRONG');await page.locator('#apply-coupon').click();await expect(page.locator('#co-btn')).toBeDisabled();await expect(page.locator('[name=name]')).toHaveValue('Keep My Name');
});
test('catalogue treats malicious product text as text',async({page})=>{
 await mock(page);await page.route('**/rest/v1/public_products*',route=>route.fulfill({contentType:'application/json',body:JSON.stringify([{...product,name:'<img src=x onerror=alert(1)>'}])}));
 let dialogs=0;page.on('dialog',d=>{dialogs++;d.dismiss()});await page.goto('/products.html');await expect(page.locator('.pt')).toContainText('<img src=x onerror=alert(1)>');expect(await page.locator('.pt img').count()).toBe(0);expect(dialogs).toBe(0);
});
