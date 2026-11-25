# FZ Cart V8

Static, accessible AED storefront and Supabase commerce backend, compatible with GitHub Pages at `/Shop/`. No payment gateway. Changes are developed on `fz-cart-v8`; this branch must not deploy automatically.

## Local development

Use Node 22+, npm, Python 3 and Chromium. Run `npm ci`, then `npm run serve` (http://localhost:4173). The browser uses the public Supabase URL/key in `supabase.js`. **Use a separate staging project for manual writes**, replacing those two public settings locally and regenerating CSP with the matching staging origins in `scripts/security-headers.mjs`. Never put a service-role key in browser code.

```
npm run security:headers  # after modifying inline page scripts
npm run check
npm test                  # isolated PGlite and PostgreSQL 17; no production connection
npm run test:browser       # mocked APIs, real Chromium at mobile/tablet/desktop sizes
```

Set `CHROMIUM_PATH` if your Chromium is not `/usr/bin/chromium`. Alternatively install Playwright Chromium with `npx playwright install chromium` and set that variable to its executable path. Database concurrency tests allocate a disposable local cluster on port 55439; do not run concurrent copies of the test suite. The embedded PostgreSQL package is pinned to PostgreSQL 17.12; its npm wrapper version includes `beta`.

## Architecture

- `supabase.js`: public client, customer/admin APIs, validated browser cart and CSV utilities.
- `shop.js`, `shop.css`: storefront, accessible product gallery, variants, favourites and sharing.
- `account.html`, `account.js`: registration, sign-in, recovery, profile and owned order history.
- `admin.html`, `admin-*.js`: products, inventory, orders, invoice PDF/print, reports, promotions, delivery, customers and audit trail.
- `supabase/migrations/`: additive changes for the audited existing schema. **Not a fresh-database bootstrap.**
- `tests/fixtures/production-schema.sql`: schema-only testing fixture with simplified Auth/privileges; never run on production.
- `vendor/`: pinned Supabase 2.110.1 and QR 1.4.4 browser libraries; no CDN required at runtime.

See [deployment and migration guide](docs/DEPLOYMENT.md), [security review](docs/SECURITY.md), [operator guide](docs/OPERATIONS.md), and [development status](DEVELOPMENT_STATUS.md). CI performs checks only; it does not deploy or migrate.
