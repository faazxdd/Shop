const {test, expect, devices} = require('@playwright/test');

test.use({...devices['iPhone 13'], defaultBrowserType: 'chromium'});

test('inline scripts run under the page CSP and mobile navigation works by touch', async ({baseURL, context, page}) => {
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === new URL(baseURL).origin) return route.continue();
    if (url.pathname.endsWith('/business_settings')) return route.fulfill({json: {business_name: 'FZ Cart', currency: 'AED'}});
    return route.fulfill({json: []});
  });
  await context.routeWebSocket('**/realtime/**', socket => socket.close());
  await page.addInitScript(() => {
    window.inlinePolicyViolations = [];
    document.addEventListener('securitypolicyviolation', event => {
      if (event.blockedURI === 'inline') window.inlinePolicyViolations.push(event.effectiveDirective);
    });
  });

  for (const path of ['/index.html', '/cart.html', '/admin.html']) {
    await page.goto(path);
    await page.waitForLoadState('load');
    expect(await page.evaluate(() => window.inlinePolicyViolations), path).toEqual([]);
  }

  await page.goto('/index.html');
  await page.getByRole('navigation', {name: 'Quick navigation'}).getByRole('link', {name: 'Cart'}).tap();
  await expect(page).toHaveURL(/\/cart\.html/);
});

test('home page makes one request for all category previews', async ({baseURL, context, page}) => {
  const categories = Array.from({length: 10}, (_, index) => ({
    id: String(index + 1),
    name: 'Category ' + (index + 1),
  }));
  let previewRequests = 0;
  let perCategoryRequests = 0;
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === new URL(baseURL).origin) return route.continue();
    if (url.pathname.endsWith('/business_settings')) return route.fulfill({json: {business_name: 'FZ Cart', currency: 'AED'}});
    if (url.pathname.endsWith('/categories')) return route.fulfill({json: categories});
    if (url.pathname.endsWith('/public_products') && url.searchParams.has('category_id')) perCategoryRequests++;
    if (url.pathname.endsWith('/rpc/category_previews')) {
      previewRequests++;
      return route.fulfill({json: categories.map(category => ({
        id: 'product-' + category.id,
        name: 'Preview ' + category.id,
        category_id: category.id,
        selling_price: 10,
        stock_status: 'in_stock',
        images: [],
      }))});
    }
    return route.fulfill({json: []});
  });
  await context.routeWebSocket('**/realtime/**', socket => socket.close());

  await page.goto('/index.html');
  await expect(page.locator('#category-sections .pc')).toHaveCount(10);
  expect(previewRequests).toBe(1);
  expect(perCategoryRequests).toBe(0);
});
