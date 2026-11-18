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
/* ---------- Icons: one consistent line style (24px grid, 1.6 stroke, round caps) ---------- */
const ICONS = {
  bag: '<path d="M5.5 8h13l1 11.2a1.5 1.5 0 0 1-1.5 1.6H6a1.5 1.5 0 0 1-1.5-1.6L5.5 8z"/><path d="M9 8V6.8a3 3 0 0 1 6 0V8"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  box: '<path d="M3.5 7.5L12 3l8.5 4.5v9L12 21l-8.5-4.5v-9z"/><path d="M3.5 7.5L12 12l8.5-4.5"/><path d="M12 12v9"/>',
  image: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10.5" r="1.5"/><path d="M20.5 16l-4.5-4.5L8 19"/>',
  alert: '<path d="M12 4l9 15.5H3L12 4z"/><path d="M12 10v4"/><path d="M12 17h.01"/>',
  settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  left: '<path d="M14.5 6l-6 6 6 6"/>',
  right: '<path d="M9.5 6l6 6-6 6"/>'
};
function icon(name, size = 24) {
  return `<svg class="ico-svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name] || ''}</svg>`;
}

function productImage(url, alt = '', cls = 'thumb') {
  if (!url) return `<div class="thumb-empty ${cls === 'thumb' ? '' : ''}" aria-hidden="true">${icon('image', 34)}</div>`;
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
        ${icon('bag', 22)}<span class="cart-count" id="cart-count" data-n="0"></span>
      </a>
    </div>`;
  updateCartBadge();
}

var lastCartN = null;   // previous cart size, so only an increase animates
function updateCartBadge() {
  const el = $('#cart-count');
  if (!el) return;
  const n = Shop.cart.count();
  el.textContent = n > 0 ? (n > 99 ? '99+' : n) : '';
  el.dataset.n = String(n);
  if (lastCartN !== null && n > lastCartN) {
    const link = el.closest('.cart-link');
    if (link) {
      link.classList.remove('bump');
      void link.offsetWidth;          // restart the CSS animation
      link.classList.add('bump');
    }
  }
  lastCartN = n;
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
