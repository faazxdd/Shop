# Release status: NOT READY

- Branch: fix/v8-checkout-security; target: fz-cart-v8.
- Draft PR: https://github.com/faazxdd/Shop/pull/5
- Verified upload head: cccf4f2c2a902ce71d0883eab82368b7cadec7a1
- Migration directory: 20261125032648_commerce_v8.sql, 20261125045933_require_checkout_login.sql, 20261126000000_checkout_anonymous_guard.sql. No old copies.
- Upload verification: six PASS; two FAIL. tests/fixtures/production-schema.sql lacks auth.jwt(); tests/browser/storefront.spec.js lacks signIn(page) and the login-required cart test.
- DEVELOPMENT_STATUS.md still references old migration timestamp.
- Completed push CI: https://github.com/faazxdd/Shop/actions/runs/45769045276
- npm ci: PASS; npm run check: PASS; npm test: FAIL (4 pass, 3 fail); playwright install and browser regression: SKIPPED after npm test failure.
- PostgreSQL 17 concurrent orders never oversell or redeem a coupon twice: tests/concurrency.test.mjs:22:9, ERR_ASSERTION, 0 !== 1. Likely fixture-related, unconfirmed.
- schema upgrade, ownership, checkout, stock, coupons and audit: tests/database.test.mjs:5:1, 42883, function auth.jwt() does not exist.
- customer ownership, forged prices, discounts, legacy API and stock rollback: tests/database.test.mjs:61:2, ERR_ASSERTION, expected /Coupon/, actual error: function auth.jwt() does not exist.
- Proposed minimal fixes awaiting approval: restore exact ZIP auth.jwt() fixture definition and browser test file; rerun CI without weakening assertions. No application defect established yet.
- PR-specific CI unverified; this report describes completed push CI on the upload head.
- Production untouched; no merge, deployment or staging creation. Staging cost approval required.
- Manual device, OAuth, email, printing and sharing checks remain blocked.
