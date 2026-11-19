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
        <button class="icon-btn" data-close aria-label="Close"><i class="i i-close"></i></button>
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
  if (!url) return `<div class="thumb-empty" aria-hidden="true"><i class="i i-camera"></i></div>`;
  return `<img class="${esc(cls)}" src="${esc(url)}" alt="${esc(alt)}" loading="lazy" decoding="async">`;
}

/* ---------- Theme (light / dark) ---------- */
// The initial theme is applied by a tiny inline script in each page's <head>.
document.addEventListener('click', e => {
  if (!e.target.closest('.theme-toggle')) return;
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('theme', next); } catch { /* ignore */ }
});

/* ---------- Customer header / footer ---------- */
// step: 1 = Cart, 2 = Checkout, 3 = Confirmation, 4 = all done. Omit to hide the step indicator.
function stepsHtml(step) {
  const labels = ['Cart', 'Checkout', 'Confirmation'];
  return '<div class="steps" aria-label="Checkout progress">' + labels.map((l, i) => {
    const n = i + 1, cls = n < step ? 'done' : n === step ? 'active' : '';
    return (i ? `<span class="sep ${n <= step ? 'done' : ''}"></span>` : '') +
      `<span class="step ${cls}"><span class="dot">${n < step ? '<i class="i i-check"></i>' : n}</span><span class="step-label">${l}</span></span>`;
  }).join('') + '</div>';
}

function priceHtml(n) {
  return `<small>${esc(_currency)}</small>${Number(n || 0).toFixed(2)}`;
}

function renderSiteHeader(active = '', step = 0) {
  const host = $('#site-header');
  if (!host) return;
  const link = (href, label, key) => `<a href="${href}" class="${active === key ? 'on' : ''}">${label}</a>`;
  const tab = (href, icon, label, key, extra = '') =>
    `<a href="${href}" class="${active === key ? 'on' : ''}" ${active === key ? 'aria-current="page"' : ''}><i class="i ${icon}"></i>${label}${extra}</a>`;
  host.className = 'site-header';
  host.innerHTML = `
    <div class="container">
      <a class="brand" href="index.html" aria-label="Home"><span class="logo"><img src="icons/logo.png" alt="" width="76" height="32"></span><span id="brand-name" class="sr-only">Shop</span></a>
      <nav class="nav-links" aria-label="Main">
        ${link('index.html', 'Home', 'home')}
        ${link('products.html', 'Shop', 'products')}
        ${link('orders.html', 'My orders', 'orders')}
      </nav>
      <span class="spacer"></span>
      <a class="icon-btn" href="products.html?saved=1" aria-label="Saved products"><i class="i i-heart"></i></a>
      <button class="icon-btn theme-toggle" type="button" aria-label="Switch light or dark theme"><i class="i i-moon"></i><i class="i i-sun"></i></button>
      <a class="icon-btn cart-link" href="cart.html" aria-label="Cart">
        <i class="i i-bag"></i><span class="cart-count" id="cart-count" data-n="0"></span>
      </a>
    </div>`;
  // Checkout progress sits under the header, outside the sticky bar.
  if (step) host.insertAdjacentHTML('afterend', `<div class="steps-bar"><div class="container">${stepsHtml(step)}</div></div>`);

  if (!$('.tabbar')) {
    const bar = document.createElement('nav');
    bar.className = 'tabbar';
    bar.setAttribute('aria-label', 'Main');
    bar.innerHTML =
      tab('index.html', 'i-home', 'Home', 'home') +
      tab('products.html', 'i-grid', 'Shop', 'products') +
      tab('cart.html', 'i-bag', 'Cart', 'cart', '<span class="tab-count" id="tab-count"></span>') +
      tab('orders.html', 'i-orders', 'Orders', 'orders');
    document.body.appendChild(bar);
  }
  updateCartBadge(true);
}

let _lastCartCount = null;
function updateCartBadge(initial) {
  const n = Shop.cart.count();
  const label = n > 0 ? (n > 99 ? '99+' : n) : '';
  const el = $('#cart-count');
  if (el) {
    el.textContent = label;
    el.dataset.n = String(n);
    if (initial !== true && _lastCartCount !== null && n !== _lastCartCount && n > 0) {
      el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
    }
  }
  const t = $('#tab-count'); if (t) t.textContent = label;
  _lastCartCount = n;
}
window.addEventListener('cart-changed', () => updateCartBadge());
window.addEventListener('storage', () => updateCartBadge());   // cart changed in another tab

// Loads business settings, sets name/title/footer. Never throws; the site still works without it.
async function applyBusinessSettings() {
  try {
    const s = await Shop.settings();
    if (!s) return null;
    const brand = $('#brand-name');
    if (brand) brand.textContent = s.business_name;
    const foot = $('#site-footer');
    if (foot) {
      const digits = (s.contact_phone || '').replace(/\D/g, '');
      foot.className = 'site-footer';
      foot.innerHTML = `
        <div class="container">
          <div>
            <strong>${esc(s.business_name)}</strong>
            <p class="fine" style="margin-top:6px">Orders are confirmed by our team. No online payment needed.</p>
          </div>
          <div>
            ${digits ? `<div class="foot-btns">
              <a class="btn btn-primary" href="tel:${esc(s.contact_phone.replace(/[^+\d]/g, ''))}"><i class="i i-phone"></i> ${esc(s.contact_phone)}</a>
              <a class="btn" target="_blank" rel="noopener" href="https://wa.me/${esc(digits)}"><i class="i i-chat"></i> WhatsApp</a>
            </div>` : ''}
            <p class="fine" style="margin:14px 0 0"><a href="orders.html">Track an order</a> &nbsp; <a href="products.html?saved=1">Saved products</a></p>
          </div>
        </div>`;
    }
    window._shopSettings = s;
    window.dispatchEvent(new Event('settings-loaded'));
    return s;
  } catch {
    return null;
  }
}

/* ---------- Product card (customer) ---------- */
function productCardHtml(p) {
  const out = p.stock_status === 'out_of_stock';
  const saved = Shop.favs.has(p.id);
  const flag = out ? '<span class="badge badge-danger pc-flag">Sold out</span>'
    : p.stock_status === 'low_stock' ? '<span class="badge badge-warning pc-flag">Few left</span>' : '';
  return `
    <article class="product-card ${out ? 'sold-out' : ''}">
      <div class="pc-media">
        ${productImage(p.images?.[0], p.name)}
        ${flag}
        <button class="fav" type="button" data-fav="${esc(p.id)}" aria-pressed="${saved}" aria-label="${saved ? 'Remove from saved' : 'Save'} ${esc(p.name)}"><i class="i i-heart"></i></button>
      </div>
      <div class="pc-body">
        ${p.category_name ? `<div class="pc-cat">${esc(p.category_name)}</div>` : ''}
        <a class="pc-name" href="products.html?id=${encodeURIComponent(p.id)}">${esc(p.name)}</a>
        <div class="pc-foot">
          <span class="price">${priceHtml(p.selling_price)}</span>
          <button class="pc-add" type="button" data-add="${esc(p.id)}" ${out ? 'disabled' : ''} aria-label="Add ${esc(p.name)} to cart"><i class="i i-plus"></i></button>
        </div>
      </div>
    </article>`;
}

// Save / quick-add buttons on any product card (event delegation).
document.addEventListener('click', e => {
  const fav = e.target.closest('[data-fav]');
  if (fav) {
    e.preventDefault();
    const on = Shop.favs.toggle(fav.dataset.fav);
    $$(`[data-fav="${CSS.escape(fav.dataset.fav)}"]`).forEach(b => b.setAttribute('aria-pressed', String(on)));
    toast(on ? 'Saved for later' : 'Removed from saved');
    return;
  }
  const add = e.target.closest('[data-add]');
  if (add) {
    e.preventDefault();
    Shop.cart.add(add.dataset.add, 1);
    add.classList.add('done');
    add.innerHTML = '<i class="i i-check"></i>';
    setTimeout(() => { add.classList.remove('done'); add.innerHTML = '<i class="i i-plus"></i>'; }, 1100);
    toast('Added to cart', 'success');
  }
});

function skeletons(n = 4) { return '<div class="skeleton" style="min-height:260px"></div>'.repeat(n); }

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
