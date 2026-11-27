const {test,expect}=require('@playwright/test');
const id='10000000-0000-0000-0000-000000000001';
async function setup(context){
 let release;
 const gate=new Promise(resolve=>{release=resolve});
 await context.route('**/gcmudhejegesvwdpkkdy.supabase.co/**',async route=>{
  const p=new URL(route.request().url()).pathname;
  if(p.endsWith('/quote_order')){
   const qty=route.request().postDataJSON().p_items[0].quantity;
   if(qty===2||qty===1&&route.request().headers()['x-audit-delay'])await gate;
   return route.fulfill({json:{subtotal:qty*20,total:qty*20,delivery_charge:0,discount_total:0}});
  }
  if(p.endsWith('/public_products'))return route.fulfill({json:[{id,name:'Audit item',selling_price:20,stock_status:'in_stock',images:[]}]});
  if(p.endsWith('/business_settings'))return route.fulfill({json:{business_name:'FC Cart',currency:'AED'}});
  return route.fulfill({json:[]});
 });
 return release;
}
test('Cart waits for a pending Add',async({context,page})=>{
 const release=await setup(context);
 await page.setExtraHTTPHeaders({'x-audit-delay':'true'});
 await page.goto('/products.html');
 const add=page.getByRole('button',{name:'Add',exact:true});
 await expect(add).toBeEnabled();
 const request=page.waitForRequest(r=>r.url().endsWith('/quote_order'));
 await add.click();
 await request;
 const link=page.locator('#site-header a[href="cart.html"]');
 await link.click();
 await expect(link).toHaveAttribute('aria-busy','true');
 await expect(page).toHaveURL(/products\.html/);
 release();
 await expect(page).toHaveURL(/cart\.html/);
 await expect(page.locator('.qty span')).toHaveText('1');
});
test('Pending increase respects removal in another tab',async({context,page})=>{
 const release=await setup(context);
 await page.goto('/products.html');
 await page.getByRole('button',{name:'Add',exact:true}).click();
 await expect(page.locator('[data-card-count]')).toHaveText('1');
 const other=await context.newPage();
 await other.goto('/cart.html');
 const request=page.waitForRequest(r=>r.url().endsWith('/quote_order')&&r.postDataJSON().p_items[0].quantity===2);
 await page.getByRole('button',{name:'Add one',exact:true}).click();
 await request;
 await other.getByRole('button',{name:'Remove',exact:true}).click();
 await expect(other.getByText('Your cart is empty')).toBeVisible();
 release();
 await page.waitForFunction(()=>cartChanges.size===0);
 await expect(page.getByRole('button',{name:'Add',exact:true})).toBeVisible();
 await expect(other.getByText('Your cart is empty')).toBeVisible();
});
