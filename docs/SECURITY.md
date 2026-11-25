# Security review and operating boundaries

## Trust boundaries

The browser uses a public publishable Supabase key. Every customer/admin authorization decision is enforced in PostgreSQL. Admin access comes from the protected `profiles.role` row, never `user_metadata`. Customers can update their name; the existing profile guard prevents ID/role escalation. Orders and their items use customer ownership RLS; guest tracking remains a separate limited-output RPC. Historical guest orders are not linked to new accounts by guessing phone/email.

Products contain private purchase prices and inventory. Direct customer reads/writes remain denied by RLS. `public_products` deliberately remains an owner-rights, security-barrier view with a fixed public projection and `status='published'` filter. **Do not make it `SELECT *`, grant public access to products, or blindly change it to security-invoker:** customers lack base-table permissions by design. Supabase's security-definer-view advisor finding is an explicit review item; the view contains no cost, raw quantity/reservation, customer data or profit columns. `admin_order_costs` uses security-invoker plus admin-only RLS on private snapshots.

New privileged RPCs revoke PostgreSQL's default `PUBLIC EXECUTE`. Checkout/quote are intentionally anonymous capabilities with bounded inputs and server pricing. Admin RPCs require `is_admin()`. Internal functions use an empty search path and qualified relations; `private.place_order` is not executable by customers. Direct stock writes are blocked even for the browser admin role; inventory mutations go through audited RPCs. No new production SQL or data writes were performed during development.

## Integrity and data preservation

- Checkout locks by idempotency key, then coupon/settings, then products in deterministic UUID order. Stock reservation, order rows, cost snapshots, discount redemption and audit writes commit together.
- Same-key retries validate request contents and customer identity/coupon. Prices supplied by clients are ignored. Product creation and initial stock are one transaction.
- Reservations release on cancellation/rejection; completion deducts stock once. Existing inventory history remains append-only and products with history cannot be deleted.
- Cost snapshots record the cost at checkout, not today's cost. Unknown historical costs remain unknown; reports flag them rather than invent backfilled values.
- Coupons count successful order placements, including later cancelled orders. They do not silently replenish on cancellation. Free-delivery thresholds apply after discounts. Delivery revenue is separate from merchandise gross profit.
- Audit logs contain actor, entity, action and changed field names, not copies of customer names, phones or addresses.

## Client protections

Text is escaped before HTML rendering; query search terms strip PostgREST grammar punctuation. CSV imports reject invalid money/integer fields and duplicate headers/SKUs; exports neutralize spreadsheet formulas including whitespace-prefixed formulas. Inline scripts are allowlisted by CSP hashes; external script execution and frames/objects are restricted. Images are limited to allowed URL schemes by CSP. Supabase and QR libraries are pinned and vendored with original notices. Credentials/private responses are never stored in the service-worker cache. The cart contains product IDs/quantities only; authoritative prices are always server-side.

GitHub Pages does not support arbitrary response headers. The checked-in meta CSP cannot enforce `frame-ancestors`, HSTS or server-side Permissions-Policy. If stronger header controls are required, configure a suitable proxy/custom hosting response layer. Regenerate CSP hashes after inline code edits.

## Remaining launch risks requiring service configuration

1. Anonymous ordering can reserve inventory without proof of phone ownership. Database locks prevent overselling but do not prevent malicious stock hoarding across unique request keys. Before an open public launch, select and test a server-verified CAPTCHA/abuse gateway or verified-account checkout policy. Merely adding a browser CAPTCHA while leaving direct anonymous RPC access would be ineffective. This branch preserves guest checkout rather than claiming it solves this separate abuse problem.
2. Guest tracking uses the inherited order-number/phone lookup and rate-limiter, not account ownership. Treat the response as a limited disclosure capability; monitor abuse. No direct anonymous order-table reads are granted. The existing rate limiter is not a substitute for a hardened edge gateway. Saved guest tracking details and checkout contact drafts stay on the customer's device; clear browser storage on shared devices.
3. Supabase Auth email delivery, signup/recovery redirect allowlists, leaked-password protection, account rate limits, backup retention, Storage MIME limits and realtime publication need staging verification. None were changed in production.
4. New tables in `private` must stay outside the exposed Data API schemas. Review actual project privileges/advisors after staging application because local Auth/Storage fixtures are simplified.
5. No real production penetration/load test or physical-device certification is claimed. The tests verify critical logic and representative browser behavior, not an absence of all vulnerabilities.

## Dependency scope

`npm` dependencies are test/development tools; the static production runtime vendors the pre-existing Supabase 2.110.1 and QR 1.4.4 client code. Review both npm audit and vendor upstream advisories when updating; `npm audit --omit=dev` alone does not scan vendored JavaScript. Never commit service-role keys, database passwords, auth tokens or private customer exports.
