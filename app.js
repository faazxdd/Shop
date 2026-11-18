/* =====================================================================
   app.js - shared UI helpers (toasts, dialogs, header/footer, badges)
   Must be loaded AFTER supabase.js (uses esc(), money(), Shop).
   ===================================================================== */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const param = name => new URLSearchParams(location.search).get(name);

function debounce(fn, ms = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function fmtDate(iso, withTime = true) {
  if (!iso) return '';
  const d = new Date(iso);
  const opts = withTime
    ? { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: 'short', year: 'numeric' };
  return d.toLocaleString(undefined, opts);
}

/* ---------- Toasts ---------- */
function toast(message, type = '') {
  let box = $('.toasts');
  if (!box) {
    box = document.createElement('div');
    box.className = 'toasts';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    document.body.appendChild(box);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;               // textContent: never injects HTML
  box.appendChild(el);
  setTimeout(() => el.remove(), type === 'error' ? 5000 : 2800);
}

/* ---------- Buttons ---------- */
// Disables a button and shows a spinner while an async action runs.
async function withBusy(btn, fn) {
  if (btn.getAttribute('aria-busy') === 'true') return;
  const original = btn.innerHTML;
  btn.setAttribute('aria-busy', 'true');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  try { return await fn(); }
  finally {
    btn.removeAttribute('aria-busy');
    btn.disabled = false;
    btn.innerHTML = original;
  }
}

/* ---------- Sheet / modal ---------- */
let _sheetEl = null;

function openSheet(title, bodyHtml) {
  closeSheet();
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-head">
        <h2 style="margin:0">${esc(title)}</h2>
        <button class="icon-btn" data-close aria-label="Close">&#10005;</button>
      </div>
      <div class="sheet-body">${bodyHtml}</div>
    </div>`;
  overlay.addEventListener('click', e => {
    if (e.target === overlay || e.target.closest('[data-close]')) closeSheet();
  });
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  _sheetEl = overlay;
  return $('.sheet-body', overlay);
}

function closeSheet() {
  if (_sheetEl) { _sheetEl.remove(); _sheetEl = null; document.body.style.overflow = ''; }
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

// Yes/No confirmation. Resolves true or false.
function confirmDialog(message, confirmLabel = 'Confirm', danger = false) {
  return new Promise(resolve => {
    const body = openSheet('Please confirm', `
      <p>${esc(message)}</p>
      <div class="row" style="justify-content:flex-end">
        <button class="btn" data-no>Cancel</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-yes>${esc(confirmLabel)}</button>
      </div>`);
    const overlay = _sheetEl;
    let done = false;
    const finish = v => { if (!done) { done = true; closeSheet(); resolve(v); } };
    $('[data-yes]', body).onclick = () => finish(true);
    $('[data-no]', body).onclick = () => finish(false);
    overlay.addEventListener('click', e => { if (e.target === overlay) finish(false); });
  });
}

/* ---------- Badges ---------- */
const ORDER_STATUS = {
  pending:    { label: 'Pending',    cls: 'badge-warning' },
  confirmed:  { label: 'Confirmed',  cls: 'badge-primary' },
  processing: { label: 'Processing', cls: 'badge-primary' },
  completed:  { label: 'Completed',  cls: 'badge-success' },
  rejected:   { label: 'Rejected',   cls: 'badge-danger' },
  cancelled:  { label: 'Cancelled',  cls: 'badge-danger' }
};
function statusBadge(status) {
  const s = ORDER_STATUS[status] || { label: status, cls: '' };
  return `<span class="badge ${s.cls}">${esc(s.label)}</span>`;
}

function stockBadge(stockStatus) {
  if (stockStatus === 'out_of_stock') return '<span class="badge badge-danger">Out of stock</span>';
  if (stockStatus === 'low_stock') return '<span class="badge badge-warning">Low stock</span>';
  return '<span class="badge badge-success">In stock</span>';
}

function productStatusBadge(status) {
  const map = { published: 'badge-success', draft: '', archived: 'badge-danger' };
  return `<span class="badge ${map[status] ?? ''}">${esc(status)}</span>`;
}

/* ---------- Images ---------- */
function productImage(url, alt = '', cls = 'thumb') {
  if (!url) return `<div class="thumb-empty ${cls === 'thumb' ? '' : ''}" aria-hidden="true">&#128247;</div>`;
  return `<img class="${esc(cls)}" src="${esc(url)}" alt="${esc(alt)}" loading="lazy" decoding="async">`;
}

/* ---------- Customer header / footer ---------- */
function renderSiteHeader(active = '') {
  const host = $('#site-header');
  if (!host) return;
  const link = (href, label, key) =>
    `<a href="${href}" ${active === key ? 'style="color:var(--primary)"' : ''}>${label}</a>`;
  host.className = 'site-header';
  host.innerHTML = `
    <div class="container">
      <a class="brand" href="index.html" id="brand-name">Shop</a>
      <nav class="nav-links" aria-label="Main">
        ${link('index.html', 'Home', 'home')}
        ${link('products.html', 'Products', 'products')}
      </nav>
      <span class="spacer"></span>
      <a class="icon-btn cart-link" href="cart.html" aria-label="Cart">
        &#128722;<span class="cart-count" id="cart-count" data-n="0"></span>
      </a>
    </div>`;
  updateCartBadge();
}

function updateCartBadge() {
  const el = $('#cart-count');
  if (!el) return;
  const n = Shop.cart.count();
  el.textContent = n > 0 ? (n > 99 ? '99+' : n) : '';
  el.dataset.n = String(n);
}
window.addEventListener('cart-changed', updateCartBadge);
window.addEventListener('storage', updateCartBadge);   // cart changed in another tab

// Loads business settings, sets name/title/footer. Never throws; the site still works without it.
async function applyBusinessSettings() {
  try {
    const s = await Shop.settings();
    if (!s) return null;
    const brand = $('#brand-name');
    if (brand) brand.textContent = s.business_name;
    const foot = $('#site-footer');
    if (foot) {
      foot.className = 'site-footer';
      foot.innerHTML = `
        <div class="container">
          <strong>${esc(s.business_name)}</strong>
          ${s.contact_phone ? `<div>Call us: <a href="tel:${esc(s.contact_phone.replace(/[^+\d]/g, ''))}">${esc(s.contact_phone)}</a></div>` : ''}
          <div class="small" style="margin-top:8px">Orders are confirmed by our team. No online payment needed.</div>
        </div>`;
    }
    return s;
  } catch {
    return null;
  }
}

/* ---------- Product card (customer) ---------- */
function productCardHtml(p) {
  const out = p.stock_status === 'out_of_stock';
  return `
    <a class="product-card" href="products.html?id=${encodeURIComponent(p.id)}">
      ${productImage(p.images?.[0], p.name)}
      <div class="body">
        <div class="name">${esc(p.name)}</div>
        <div class="price">${money(p.selling_price)}</div>
        <div>${stockBadge(p.stock_status)}</div>
      </div>
    </a>`;
}

/* ---------- Service worker ---------- */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => { /* optional feature */ });
  });
}
registerServiceWorker();

/* ---------- Global safety net ---------- */
window.addEventListener('unhandledrejection', e => {
  console.error(e.reason);
  toast(errMsg(e.reason), 'error');
});
