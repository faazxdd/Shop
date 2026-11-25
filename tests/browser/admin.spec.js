const {test,expect}=require('@playwright/test');
const fs=require('node:fs/promises');
const id='00000000-0000-0000-0000-000000000001';
const productId='10000000-0000-0000-0000-000000000001';
const orderId='20000000-0000-0000-0000-000000000001';
async function adminMock(page,role='admin'){
 const user={id,email:'qa@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{full_name:'QA Customer'}};
 const token=[{alg:'HS256',typ:'JWT'},{sub:id,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600},'test-only'].map(v=>Buffer.from(typeof v==='string'?v:JSON.stringify(v)).toString('base64url')).join('.');
 await page.addInitScript(({token,user})=>localStorage.setItem('sb-gcmudhejegesvwdpkkdy-auth-token',JSON.stringify({access_token:token,refresh_token:'test-only',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user})),{token,user});
 await page.routeWebSocket('**/realtime/**',socket=>socket.close());
 const product={id:productId,name:'Phone Pro',sku:'PHONE-1',brand:'FZ',status:'published',selling_price:100,purchase_price:40,quantity:10,reserved_quantity:1,min_stock_alert:5,images:[],attributes:{Colour:'Black'},variant_group:'Phone',categories:{name:'Phones'}};
 const order={id:orderId,order_number:1001,customer_name:'QA Customer',customer_phone:'+971501234567',delivery_address:'Dubai',status:'pending',total:110,subtotal:100,delivery_charge:10,discount_total:0,created_at:'2026-11-24T12:00:00Z',order_items:[{id:'item-1',product_id:productId,product_name:'Phone Pro',quantity:1,unit_price:100,line_total:100}]};
 await page.route('https://gcmudhejegesvwdpkkdy.supabase.co/**',route=>{
 const url=new URL(route.request().url()),path=url.pathname;let data=[];
 if(path.includes('/auth/v1/user'))data={user};
 else if(path.endsWith('/profiles'))data=url.searchParams.has('id')?{id,role,full_name:'QA Customer'}:[{id,role,full_name:'QA Customer',created_at:order.created_at}];
 else if(path.endsWith('/business_settings'))data={id:1,business_name:'FZ Cart',currency:'AED',contact_phone:'+971501234567',delivery_charge:10,free_delivery_above:null};
 else if(path.endsWith('/products'))data=[product];
 else if(path.endsWith('/categories'))data=[];
 else if(path.endsWith('/orders'))data=[order];
 else if(path.endsWith('/admin_order_costs'))data=[{item_id:'item-1',unit_cost:40}];
 else if(path.endsWith('/coupons'))data=[{code:'SAVE10',kind:'percent',value:10,uses:0,active:true}];
 else if(path.endsWith('/audit_logs'))data=[{id:1,action:'INSERT',entity:'products',entity_id:productId,actor_id:id,changed_fields:['name'],created_at:order.created_at}];
 else if(path.endsWith('/admin_dashboard_summary'))data={total_products:1,total_stock:10,orders_pending:1,orders_completed:0};
 else if(path.endsWith('/admin_sales_summary'))data={orders:1,revenue:100,profit:60,delivery:10,unknown_cost_items:0};
 else if(path.endsWith('/admin_create_product'))data={...product,id:'new-product'};
 return route.fulfill({status:200,headers:{'content-range':'0-0/1'},contentType:'application/json',body:JSON.stringify(data)});
 });
 return {product,order};
}
for(const width of [390,768,1440])test(`admin commerce panels and PDF at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});await adminMock(page);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/admin.html');await expect(page.getByText('Revenue (excluding delivery)')).toBeVisible();
 for(const section of ['Products','Promotions','Customers','Activity log','Reports','Settings']){
  await page.locator('#nav').getByRole('button',{name:section,exact:true}).click();
  await expect(page.locator('#top-title')).toHaveText(section);
  await expect(page.locator('#tab-content .card').first()).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 await page.locator('#nav').getByRole('button',{name:'Orders',exact:true}).click();
 await page.locator('#o-list .list-card').click();await expect(page.getByRole('dialog')).toBeVisible();
 const download=page.waitForEvent('download');await page.locator('#share-bill').click();const file=await download;const bytes=await fs.readFile(await file.path());expect(bytes.subarray(0,8).toString()).toBe('%PDF-1.4');expect(bytes.toString()).toContain('Delivery');expect(bytes.toString()).toContain('110.00');
 await page.screenshot({path:`test-results/admin-${width}.png`,fullPage:true});expect(errors).toEqual([]);
});
test('customer account profile and history render after sign in',async({page})=>{
 await adminMock(page,'customer');await page.goto('/account.html');await expect(page.getByRole('heading',{name:'Order history'})).toBeVisible();await expect(page.getByText('#1001')).toBeVisible();
 await page.goto('/admin.html');await expect(page.locator('#login-view')).toBeVisible();await expect(page.locator('#app-view')).toBeHidden();
});
test('image finder requires explicit approval and product save',async({page})=>{
 await adminMock(page);let saves=0,payload;
 await page.route('**/rest/v1/rpc/admin_create_product',route=>{saves++;payload=route.request().postDataJSON();return route.fulfill({contentType:'application/json',body:JSON.stringify({id:productId})})});
 await page.route('https://commons.wikimedia.org/w/api.php*',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({query:{pages:{1:{imageinfo:[{url:'https://upload.wikimedia.org/authorized-example.jpg',thumburl:'/icons/icon-192.png',descriptionurl:'https://commons.wikimedia.org/wiki/File:Example',extmetadata:{LicenseShortName:{value:'CC0'}}}]},2:{imageinfo:[{url:'https://upload.wikimedia.org/not-authorized.jpg',extmetadata:{LicenseShortName:{value:'All rights reserved'}}}]}}}})}));
 await page.route('https://upload.wikimedia.org/**',route=>route.fulfill({status:404,body:''}));
 await page.goto('/admin.html');await page.locator('#nav').getByRole('button',{name:'Products',exact:true}).click();await page.getByRole('button',{name:'Add product',exact:true}).click();
 await page.locator('#pf [name=name]').fill('Approved phone');await page.locator('#pf [name=selling_price]').fill('100');await page.locator('#pf [name=initial_qty]').fill('5');await page.locator('#pf [name=attributes]').fill('Colour: Black\nStorage: 256 GB');
 await page.getByRole('button',{name:'Find images',exact:true}).click();await expect(page.locator('[data-approve]')).toHaveCount(1);expect(saves).toBe(0);
 await page.getByRole('button',{name:'Approve image for this product'}).click();await expect(page.locator('#imgs .image-tile')).toHaveCount(1);expect(saves).toBe(0);
 await page.locator('#save').click();await expect(page.getByRole('dialog')).toBeHidden();expect(saves).toBe(1);expect(payload.p_initial_quantity).toBe(5);expect(payload.p_product.attributes).toEqual({Colour:'Black',Storage:'256 GB'});expect(payload.p_product.images).toEqual(['https://upload.wikimedia.org/authorized-example.jpg']);
});
