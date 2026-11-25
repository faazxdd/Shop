# FZ Cart operating guide

## Catalogue and variants

Create each sellable SKU as its own product. Give related variants the same **Variant group** (for example `Phone Pro`) and enter one attribute per line (`Colour: Black`, `Storage: 256 GB`, `Size: M`, or another customer-facing attribute). Each variant retains its own price, inventory, reservations and movement history. Variant groups appear in the product-detail selector; only published SKUs are selectable. Use **Original price** for a genuine prior price greater than or equal to the selling price. The selling price is always the actual offer price charged by the server.

Upload JPG/PNG/WebP images; large images are resized when the browser supports it. Use **1st** to choose a primary image. Removing a photo unlinks it from the product; it deliberately does not delete shared Storage objects used by another SKU. Archive products with order/inventory history. Unreferenced drafts can be deleted individually or in bulk after confirmation.

**Find images** searches Wikimedia Commons by product name, brand and SKU. Only candidates marked CC0/public domain are offered. Review the source and exact model, then approve each image. Saving the product publishes approved selections. Search cannot guarantee a suitable photo exists; upload manufacturer-authorized or your own photos when there is no match. Avoid assuming a Google image result is licensed.

CSV import validates the entire file's structure and numeric values before asking to import. Maximum 500 rows / 2 MB; duplicate SKUs in one file are rejected. Existing SKUs update catalogue fields without replacing inventory. New products and initial quantities save atomically per row; the whole file is not one transaction, so review the success/failure summary before retrying. Existing images/variants/original prices are preserved by CSV updates. Advanced variant fields can be edited in the product form.

## Orders and delivery

Customers may checkout as guests or sign in. Signed-in orders appear in account history; guest orders remain in device tracking. A pending order reserves stock. Accept it, then update Packed/Out for delivery; mark delivered only after delivery. Cancel/reject releases reservations. Closed orders cannot be completed twice. Payments are handled outside this platform; no online gateway is integrated.

Promotions controls coupon type/value, minimum subtotal, maximum uses, expiry and activation. Delivery settings control flat AED delivery and a free-delivery threshold after discounts. The checkout quote includes subtotal, discount and delivery. Final submission validates current stock/prices again.

## Reports, customers and audit

Dashboard revenue and gross profit use all completed orders and immutable costs; delivery collected is separate. Reports support today, seven/thirty days and custom dates. Report cohorts use order creation time in the operator's local timezone, not completion date. Exports are bounded to 5,000 orders/movements and 10,000 products; use narrower date windows or a reviewed backend export for larger datasets. Daily charts display at most 366 days. Customer/audit lists show the latest 200 records and account order history the latest 100. These limits are deliberate; this is not an unlimited warehouse reporting system.

Legacy orders lacking cost snapshots are explicitly identified and gross profit is incomplete for those rows. Do not interpret unknown cost as proof of profit. Audit records show changed field names without duplicating customer details. Customer contact/address is available in authorized order views; role changes are not exposed as an unrestricted customer feature.

## Invoices and mobile sharing

Use Print bill or Print delivery slip for browser printing / Save as PDF. Share bill generates a multi-page downloadable PDF with discount and delivery totals and uses native file sharing when supported; otherwise it downloads. WhatsApp buttons prepare a message; the operator/customer sends it manually. The existing lightweight downloadable PDF renderer supports Latin/ASCII text and transliterates unsupported characters. For Arabic/other scripts, use browser Print/Save as PDF to preserve the text; embedded-font multilingual downloadable PDFs remain a follow-up.

## PWA and recovery

The customer shell can open offline, but checkout and current stock require connectivity. Admin pages and API data are not cached by the service worker. Native push delivery is not configured. Customer registration and password recovery require a working Supabase email setup and allowed callback URL.
