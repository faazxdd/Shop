const {test,expect}=require('@playwright/test');
const first='10000000-0000-0000-0000-000000000001';
const second='10000000-0000-0000-0000-000000000002';
const products=[first,second].map((id,index)=>({id,name:'Test product '+index,images:[],stock_status:'in_stock',selling_price:20,brand:'Test'}));

async function mock(page, stock=3){
  await page.route('**/gcmudhejegesvwdpkkdy.supabase.co/**',async route=>{
    const request=route.request();
    const url=new URL(request.url());
    if(url.pathname.endsWith('/quote_order')){
      const items=request.postDataJSON().p_items;
      if(items.some(item=>item.quantity>stock))return route.fulfill({status:400,json:{message:'Not enough stock for this product'}});
      return route.fulfill({json:{subtotal:20,discount_total:0,delivery_charge:0,total:20}});
    }
    if(url.pathname.endsWith('/public_products'))return route.fulfill({json:products});
    if(url.pathname.endsWith('/business_settings'))return route.fulfill({json:{business_name:'FC Cart',currency:'AED'}});
    return route.fulfill({json:[]});
  });
}

for(const width of [390,768,1440])test(`catalogue motion at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  await mock(page);
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/products.html');
  const cards=page.locator('.pc');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(1)).toHaveCSS('animation-delay','0.065s');
  await expect(page.locator('main')).toHaveCSS('animation-duration','0.28s');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const card=cards.first();
  const original=await card.elementHandle();
  const add=card.locator('[data-add]');
  await expect(add).toHaveCSS('touch-action','manipulation');
  await add.evaluate(button=>{for(let i=0;i<5;i++)button.click()});
  await expect(card.locator('[data-card-count]')).toHaveText('3');
  await expect(add).toBeDisabled();
  await expect(page.locator('[data-cartcount]').first()).toHaveText('3');
  await card.locator('[data-card-minus]').click();
  await expect(card.locator('[data-card-count]')).toHaveText('2');
  await expect(add).toBeEnabled();
  await card.locator('[data-fav]').click();
  await expect(card.locator('[data-fav]')).toHaveAttribute('aria-pressed','true');
  expect(await original.evaluate(node=>node===document.querySelector('.pc'))).toBe(true);
  expect(errors).toEqual([]);
});

test('reduced motion, navigation, and ten-unit cap',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await mock(page,50);
  await page.goto('/index.html');
  await page.goto('/products.html');
  await expect(page.locator('.dock [aria-current=page]')).toHaveText('Products');
  await expect(page.locator('.motion-dock-indicator')).toHaveCSS('animation-name','none');
  const card=page.locator('.pc').first();
  await expect(card).toHaveCSS('animation-name','none');
  await card.locator('[data-add]').evaluate(button=>{for(let i=0;i<12;i++)button.click()});
  await expect(card.locator('[data-card-count]')).toHaveText('10');
  await expect(card.locator('[data-add]')).toBeDisabled();
  await card.locator('[data-card-minus]').evaluate(button=>{for(let i=0;i<10;i++)button.click()});
  await expect(card.locator('[data-add]')).toHaveText('Add');
});

test('customer pages, theme, and dialog focus remain usable',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await mock(page);
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  for(const path of ['/index.html','/products.html?saved=1','/orders.html','/account.html','/cart.html','/products.html']){
    const response=await page.goto(path);
    expect(response.ok()).toBe(true);
    await expect(page.locator('main')).toHaveCSS('animation-duration','0.28s');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.getByRole('button',{name:'Switch to dark mode'}).click();
  await expect(page.locator('html')).toHaveAttribute('data-shop-theme','dark');
  const title=page.getByRole('button',{name:'Test product 0',exact:true});
  await title.press('Enter');
  await expect(page.getByRole('dialog')).toBeFocused();
  await expect(page.locator('#sheet')).toHaveCSS('transition-duration','0.24s');
  await page.keyboard.press('Escape');
  await expect(title).toBeFocused();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('product sheet tracks the remaining cart quantity',async({page})=>{
  await mock(page,50);
  await page.addInitScript(id=>localStorage.setItem('cart_v1',JSON.stringify([{product_id:id,quantity:10}])),first);
  await page.goto('/products.html');
  await page.getByRole('button',{name:'Test product 0',exact:true}).click();
  const sheet=page.getByRole('dialog');
  await expect(sheet.getByRole('button',{name:'Add to cart'})).toBeDisabled();
  await expect(sheet.locator('#pq')).toHaveText('0');
  await page.evaluate(id=>Shop.cart.setQty(id,9),first);
  await expect(sheet.getByRole('button',{name:'Add to cart'})).toBeEnabled();
  await expect(sheet.locator('#pq')).toHaveText('1');
  await expect(sheet.getByRole('button',{name:'More'})).toBeDisabled();
});
