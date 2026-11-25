# FZ Cart V8 development status

Branch: `fz-cart-v8`. Starting V8 revision: `4c81e8e`. Production database was audited read-only and was not modified. No production deployment or merge was performed.

## Completed in this branch

- Audited the existing static storefront/admin application, both prior V8 commits, dependency versions, nine Supabase public tables, RLS policies, SQL RPCs, triggers and Storage policies. Preserved checkout draft and stale-render fixes.
- Kept the minimalist black-and-white responsive storefront and added server-backed price/stock filters, stronger search, original/offer prices, variant groups and attributes, keyboard-accessible product gallery/zoom, customer accounts, password recovery and signed-in order history. Existing guest tracking, favourites, recent views, sharing and dark mode remain.
- Checkout now shows authoritative subtotal, coupon discount and delivery charges. The server rechecks prices and stock, atomically reserves inventory, captures historical cost and handles duplicate requests. Product creation and initial stock are atomic.
- Added delivery/coupon, customer and audit panels to the admin dashboard; historical sales/profit summary; daily/weekly/monthly/custom reports; invoice discount/delivery lines; CSV validation; working bulk archive; product variant/image controls. The authorized Wikimedia finder requires review and approval before product publication.
- Added RLS-controlled tables, customer-owned order reads, admin-only historical costs/audit, explicit RPC privileges, stock-write guards, CSP, offline-shell cache boundaries, pinned vendored browser libraries, SEO metadata, CI and documentation.
- Prepared additive migration, schema-only test fixture, preflight/postflight queries and [deployment](docs/DEPLOYMENT.md), [security](docs/SECURITY.md), [operations](docs/OPERATIONS.md) guides. Existing accounts, products, settings, orders and stock history are preserved by the migration.

## Verification (2026-11-25)

- `npm run check`: passed JavaScript syntax, duplicate HTML ID and CSP hash checks.
- `npm test`: 7 passed, 0 failed. Includes isolated PostgreSQL 17 concurrent last-unit checkout, same-key retries and one-use coupon redemption; PGlite schema/RLS/price/stock/ownership regression; client CSV/XSS/cart checks and service-worker cache privacy checks.
- `npm run test:browser`: 14 passed, 0 failed on Chromium with mocked network data. Tested customer and admin flows, product variants, coupon errors, order confirmation, authorized image approval, PDF bytes, XSS rendering and layouts at 375, 390, 768 and 1440 px. The representative mocks do not certify a live Supabase environment or physical mobile devices.
- `npm audit`: zero reported vulnerabilities for pinned npm dependencies as of this check. Vendored browser scripts need separate upstream review when updated.

## Remaining release gates and limitations

- Apply the migration to an isolated **real Supabase staging project** and run `supabase/postflight.sql`, advisors, real Auth/Storage/REST checks, email signup/recovery and live order tests. The local fixtures simplify managed Auth/Storage privileges. No staging project was available for this task.
- Decide and validate a **server-enforced guest-checkout abuse control** before open public release. The existing anonymous checkout can be abused to reserve stock with many unique requests despite overselling prevention. See [security review](docs/SECURITY.md).
- Verify real iOS Safari, Android Chrome and tablet/desktop PWA installation, native sharing, printing, QR, offline behavior and multilingual invoice needs. Browser viewport tests are representative only; downloadable PDF currently transliterates unsupported scripts.
- Supabase Auth leaked-password protection was disabled in the read-only advisor audit. Enable it and verify rate limits/email redirect configuration in the release environment.
- Reporting is intentionally bounded: 5,000 orders/movements, 10,000 products, latest 200 customers/audit entries, latest 100 account orders. Historical orders have no cost snapshot and show incomplete profit rather than guessed costs.
- Branch review/CI must pass at the pushed SHA before any migration, merge or Pages deployment. No online payment gateway or paid image API was added, as requested.
