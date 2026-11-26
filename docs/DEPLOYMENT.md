# Deployment and database migration guide

## Release state

This branch is a review candidate, not an approved production deployment. Production was inspected read-only. No migration, schema reset, order creation, merge or Pages deployment was performed against production.

The migration targets the existing FZ Cart schema inspected on 2026-11-24 (Supabase PostgreSQL 17). Existing migration history contained `20261119013609`, `20261119013719`, and `20261119014049`. The new SQL is additive; it preserves product/order/profile IDs, accounts, settings and inventory movement history. It moves the old reservation implementation to `private.place_order` and restores the original public signature as a compatibility wrapper.

## 1. Prepare a staging environment

1. Export a current schema and create a verified backup using the Supabase dashboard/your established backup procedure. Verify restore ability before scheduling production work. Do not commit customer exports, Auth data or credentials.
2. Use a separate Supabase staging project with the same schema and synthetic accounts/products. A paid Supabase branch is optional, not required. Do not use production as the test environment.
3. Compare staging/production with `supabase/preflight.sql`. Investigate schema drift rather than blindly continuing. The source repository did not contain the three historical migrations; retrieve the actual baseline from the dashboard/history. **Never run `tests/fixtures/production-schema.sql` on a connected Supabase project.** It contains test roles and simplified Auth, and is only for the disposable test engines.
4. Configure staging Auth email confirmation, password policy and redirects to the staging URL's `account.html`. Ensure the `on_auth_user_created` trigger calls `handle_new_user` and assigns `customer`, regardless of user metadata.
5. Ensure the `product-images` bucket exists, has public read access, and restricts write/delete to `public.is_admin()`. Set allowed MIME types to JPEG/PNG/WebP and a 15 MB maximum. The application compresses uploads but client checks do not replace bucket restrictions.

## 2. Rehearse the migration

- Run `npm ci`, `npm run check`, `npm test`, and `npm run test:browser` locally/CI.
- Open **the staging project's** SQL editor, verify its project reference, and execute the entire `supabase/migrations/20261124074217_commerce_v8.sql` file once. It has a transaction boundary; an error must roll the transaction back. Do not execute arbitrary fragments or re-run after success. This is an existing-schema upgrade, not an idempotent bootstrap.
- Run `supabase/postflight.sql`. Run the Supabase Security Advisor and inspect the documented deliberate definer-view/RPC warnings in `SECURITY.md`.
- Test anonymous, customer A, customer B and administrator accounts through the real staging REST API. Verify: customer A cannot read B's order or costs; no customer can change prices, quantities, coupons or roles; staff is not automatically admin; public catalogues show published products only.
- Test signup/confirmation/recovery, variant stock, uploads, CSV validation, coupon expiry/limits, free-delivery thresholds, order retry after network failure, cancel/reject release, fulfillment, completed cost reporting and PDF/print/share. Check old `place_order` clients still work.
- Run simultaneous checkouts for the last unit and last coupon use. Local PostgreSQL concurrency tests cover this logic, but real PostgREST/Auth/Storage behavior must also pass.
- Use real iOS Safari, Android Chrome and tablet/desktop browsers for installability, native sharing and printing. The automated viewport tests are not physical-device tests.

## 3. Production database release (future authorized operation)

1. Preserve a fresh backup, record current table counts and the deployed frontend revision. Schedule a low-traffic change window; pause admin catalogue edits during schema changes.
2. Review the exact rehearsed migration and security advisor results. If the baseline has changed, repeat staging validation.
3. Apply only the reviewed new migration once using the team's Supabase migration process or SQL editor. If using SQL editor, record its version in your release/change log; coordinate the Supabase CLI migration history before later CLI pushes. Do not run `db reset`, `migration down`, or push a test baseline.
4. Run postflight, compare existing row counts and IDs to the pre-change record, and verify authenticated/anonymous access with controlled smoke tests.
5. Keep delivery at its default **AED 0** until V8 frontend rollout completes. Old clients use the same new pricing wrapper but do not display delivery breakdowns. Leave coupons disabled until the new checkout is verified.
6. Confirm the `private` schema is **not** exposed by the Data API. Keep public access through the explicit projections and RPCs only.

## 4. Frontend release on GitHub Pages

1. Require successful CI on the exact PR head and completed staging acceptance. Review this PR, then authorize merging separately. This task does not merge to `main`.
2. Check Settings → Pages source. It must use the intended production branch (normally `main`), never the development branch `fz-cart-v8`. The supplied CI workflow has no deploy job.
3. Ensure `supabase.js` points at the intended project's **publishable** key. Update the Supabase origin in `scripts/security-headers.mjs` when changing projects. Run `npm run security:headers` and `npm run check` after editing inline scripts or origins.
4. Publish the static repository root using the existing Pages setup, preserving `/Shop/` paths. There is no runtime Node server, build output or online payment setup. Include `vendor/`, icons, manifests and service worker. `.nojekyll` disables unnecessary Jekyll processing.
5. Increment `CACHE_VERSION` in `service-worker.js` for every release. Test existing installed clients and a clean browser. Static shells can work offline; live prices, authentication and checkout require connectivity.
6. Verify catalogue, login, cart/quote/confirmation, admin authorization and invoice download on the deployed revision. Monitor Supabase logs for SQL errors, duplicate attempts, reservation anomalies and unauthorized access.

## Rollback and recovery

Prefer a forward fix. Frontend rollback is possible by redeploying the prior reviewed revision; keep delivery at zero while old clients are in use. Do not delete new columns, snapshots, audit records or coupon data in a rollback. The public five-argument checkout remains compatible. If schema application fails, roll back its transaction and diagnose on staging. Restore production from backup only through the established incident procedure; restoring can lose orders placed after the backup and requires reconciliation.

## Configuration and release gates still requiring the real service

- Staging project URL/public key, email redirect allowlist, working confirmation/recovery email delivery and bucket restrictions.
- Enable leaked-password protection if available on your Supabase plan; review password strength and rate limits.
- Checkout requires login: confirm Anonymous sign-ins are disabled and email confirmation/rate limits are on (see `SECURITY.md`). No SMS/email, CAPTCHA, push-delivery or payment provider was configured.
- Physical-device native share/print/PWA testing and hosted load testing.
