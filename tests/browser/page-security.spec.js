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

test('home page shows category links and one product grid', async ({baseURL, context, page}) => {
  let catalogueRequests = 0;
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === new URL(baseURL).origin) return route.continue();
    if (url.pathname.endsWith('/business_settings')) return route.fulfill({json: {business_name: 'FZ Cart'}});
    if (url.pathname.endsWith('/categories')) return route.fulfill({json: [{id: 'a', name: 'Accessories'}]});
    if (url.pathname.endsWith('/public_products')) {
      catalogueRequests++;
      return route.fulfill({json: [{id: 'item', name: 'Canvas bag', selling_price: 10}]});
    }
    if (url.pathname.endsWith('/rpc/category_previews')) throw Error('Unexpected category preview request');
    return route.fulfill({json: []});
  });
  await context.routeWebSocket('**/realtime/**', socket => socket.close());
  await page.goto('/index.html');
  await expect(page.getByRole('link', {name: 'Accessories'})).toHaveAttribute('href', 'products.html?cat=a');
  await expect(page.locator('main .pc')).toHaveCount(1);
  expect(catalogueRequests).toBe(1);
});
