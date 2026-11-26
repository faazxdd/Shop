# Release status: NOT READY

- Branch: `fix/v8-checkout-security`; target: `fz-cart-v8`.
- Migration history reconciled: `faf5b71aa13593f19cb4d2779e605f01a7cb3634`.
- Anonymous JWT guard: `fbb6ca70702c9057afa6944cd8832c40a5b96896`.
- CI triggers: `66451e9b6b03178e60e17dff96be30cd665cf29c`.
- Migration directory verified; no old-named copies remain.
- Original commerce migration differs from production only by `IF NOT EXISTS` on `order_items_order_idx`.
- Eight ZIP test and documentation files remain pending exact transfer. Do not substitute reconstructed content.
- PR pending. Final CI results unverified.
- Staging not created; cost approval required. Production read-only; no migration, merge or deployment authorized.
- Manual device, OAuth, email, printing and sharing checks pending.
- Next: transfer exact ZIP files, commit tests and docs separately, open PR, inspect CI failures without changing assertions or fixing failures before review.
