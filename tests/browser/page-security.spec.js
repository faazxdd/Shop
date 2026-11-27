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
