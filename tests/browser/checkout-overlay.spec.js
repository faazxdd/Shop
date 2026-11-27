const { test, expect } = require('@playwright/test');

const id = '10000000-0000-0000-0000-000000000001';
const user = {
  id, email: 'shopper@example.invalid', aud: 'authenticated', role: 'authenticated',
  app_metadata: {}, user_metadata: { full_name: 'Test Customer' }
};

async function openCart(page, checkout) {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const token = [{ alg: 'HS256', typ: 'JWT' }, { sub: id, exp: expiresAt }, 'test-only']
    .map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
  await page.addInitScript(({ user, token, expiresAt, id }) => {
    localStorage.setItem('cart_v1', JSON.stringify([{ product_id: id, quantity: 2 }]));
    localStorage.setItem('sb-gcmudhejegesvwdpkkdy-auth-token', JSON.stringify({
      access_token: token, refresh_token: 'test-only', expires_at: expiresAt, token_type: 'bearer', user
    }));
  }, { user, token, expiresAt, id });

  await page.route('https://gcmudhejegesvwdpkkdy.supabase.co/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/checkout_v8')) return checkout(route);
    if (path.endsWith('/business_settings')) return route.fulfill({ json: { business_name: 'FZ Cart', currency: 'AED' } });
    if (path.endsWith('/public_products')) return route.fulfill({ json: [{ id, name: 'Dress', selling_price: 50, stock_status: 'in_stock' }] });
    if (path.endsWith('/quote_order')) return route.fulfill({ json: { total: 110, delivery_charge: 10 } });
    return route.fulfill({ json: [] });
  });
  await page.goto('/cart.html');
  await page.locator('[name=phone]').fill('+971501234567');
}

const order = { order_id: id, order_number: 1001, total: 108.25 };

test('quick checkout waits before confirmation and submits only once', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let requests = 0;
  await openCart(page, route => { requests++; return route.fulfill({ json: order }); });
  const button = page.getByRole('button', { name: 'Place order' });
  await expect(button).toBeEnabled();
  const started = Date.now();
  await button.dblclick();
  await expect(button).toBeDisabled();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveAccessibleName('Processing your order…');
  const ring = dialog.locator('.fz-spinner');
  await expect(ring).toHaveCSS('animation-name', 'fz-checkout-spin');
  await expect(ring).toHaveCSS('background-image', /conic-gradient/);
  await expect(ring).toHaveCSS('width', '32px');
  await expect(dialog).toHaveCSS('width', '244px');
  await expect(dialog.locator('h2')).toHaveCSS('outline-style', 'none');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleName('Order Confirmed');
  await expect(ring).toBeHidden();
  await expect(dialog.locator('.fz-checkmark-badge')).toBeVisible();
  await expect(dialog).toHaveCSS('width', '320px');
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('link', { name: 'View my orders' })).toBeFocused();
  expect(Date.now() - started).toBeGreaterThanOrEqual(1500);
  expect(requests).toBe(1);
  await expect(dialog).toContainText('Order #1001 · Total AED 108.25');
  await expect(page.getByText('Your cart is empty')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cart_v1')))).toEqual([]);
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Your cart', exact: true })).toBeFocused();
});

test('a slow response stays processing and a failed order can retry with the same key', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
  const keys = [];
  let release;
  const response = new Promise(resolve => { release = resolve; });
  await openCart(page, async route => {
    keys.push(route.request().postDataJSON().p_idempotency_key);
    if (keys.length === 1) {
      await response;
      return route.fulfill({ status: 400, json: { message: 'Order temporarily unavailable' } });
    }
    return route.fulfill({ json: order });
  });
  const button = page.getByRole('button', { name: 'Place order' });
  await button.click();
  const dialog = page.getByRole('dialog');
  try {
    await expect(dialog).toHaveAccessibleName('Processing your order…');
    await expect(page.locator('.fz-spinner')).toHaveCSS('animation-name', 'none');
    await new Promise(resolve => setTimeout(resolve, 1600));
    await expect(dialog).toHaveAccessibleName('Processing your order…');
  } finally {
    release();
  }
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('alert')).toHaveText('Could not place the order. Please try again.');
  await expect(button).toBeEnabled();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cart_v1')))).toHaveLength(1);
  await button.click();
  await expect(dialog).toHaveAccessibleName('Order Confirmed');
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBeTruthy();
  expect(keys[1]).toBe(keys[0]);
});
