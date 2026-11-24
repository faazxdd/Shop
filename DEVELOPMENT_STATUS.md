# FZ Cart V8 development status

Branch: fz-cart-v8. Baseline: 4c81e8e. Production is read-only during development.

## Audit (2026-11-24)
- Read all 20 source/manifest files, V8 commits and main comparison. Buildless static JS; pinned Supabase CDN 2.110.1; lazy QR library 1.4.4. No test suite, dependency manifest or SQL migrations existed.
- Supabase schema/policies/functions/triggers inspected without reading customer records. Nine RLS-enabled tables; public catalogue exposes selected columns via owner-rights view. Admin RPCs check database profile role; inventory reservation locks products in deterministic order; idempotency request hash exists.
- Existing V8 preserves checkout form drafts and guards stale renders/double submits. These fixes are retained.
- Found broken bulk archive (missing API method), permissive CSV numeric parsing, historical profits based on current cost, no customer login UI, no coupon/delivery pricing, no variant grouping, no audit log.
- Security advisors: catalogue owner-rights view, callable definer RPCs, leaked-password protection disabled. Function exposure is not proof of exploit; explicit authorization and privilege tests are required.

## Work in progress
- Additive migration and local database regression harness.
- Customer accounts, variant selection, promotions, checkout and admin workflows.
- Accessibility, responsive verification and security regression tests.

## Release gates
- No production data reset, migration execution, merge or deployment authorized in this work.
- Local database fixture is schema-only, for isolated tests; never apply it to production.
- Real Supabase staging and mobile device acceptance remain required before release.
