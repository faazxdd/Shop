/* =====================================================================
   admin-orders.js - Orders tab (admin part 2)
   Loaded by admin.html after the core script. Uses Tabs, Admin, helpers.
   ===================================================================== */

(function () {
  const STATUS_FILTERS = [['', 'All'], ['pending', 'Pending'], ['confirmed', 'Confirmed'], ['processing', 'Processing'],
                          ['completed', 'Completed'], ['rejected', 'Rejected'], ['cancelled', 'Cancelled']];

  // Allowed next steps per status (the database enforces the same rules).
  const ACTIONS = {
    pending:    [['confirmed', 'Accept', 'btn-success'], ['rejected', 'Reject', 'btn-danger']],
    confirmed:  [['completed', 'Mark delivered', 'btn-success'], ['cancelled', 'Cancel order', 'btn-danger']],
    processing: [['completed', 'Mark delivered', 'btn-success'], ['cancelled', 'Cancel order', 'btn-danger']]
  };

  // Delivery steps the customer sees on their Orders page (only while the order is accepted).
  const STEPS = [['', 'Accepted'], ['packed', 'Packed'], ['out_for_delivery', 'Out for delivery']];
  const STEP_LABEL = { packed: 'Packed', out_for_delivery: 'Out for delivery' };
  const canStep = o => o.status === 'confirmed' || o.status === 'processing';
  function stageBadge(o) {
    return canStep(o) && o.fulfillment_step
      ? `<span class="badge badge-primary">${esc(STEP_LABEL[o.fulfillment_step] || o.fulfillment_step)}</span>` : statusBadge(o.status);
  }

  let reloadList = null;   // set while the Orders tab is on screen

  function digits(phone) { return String(phone || '').replace(/\D/g, ''); }

  // WhatsApp needs the full international number. Local UAE numbers (05xxxxxxxx) get +971.
  function waNumber(phone) {
    const raw = String(phone || '');
    const d = digits(raw);
    if (/^\s*\+/.test(raw)) return d;                  // already international
    if (d.startsWith('00')) return d.slice(2);
    if (d.startsWith('971')) return d;
    if (d.startsWith('0')) return '971' + d.slice(1);
    if (/^5\d{8}$/.test(d)) return '971' + d;
    return d;
  }

  let shopCfg = null;                                   // business_settings (name, phone, currency)
  async function getShop() {
    if (!shopCfg) { try { shopCfg = await Shop.settings(); } catch { shopCfg = {}; } }
    return shopCfg || {};
  }

  const STAGE_TEXT = {
    '': 'has been accepted. We will update you when it is packed.',
    packed: 'is packed and getting ready for delivery.',
    out_for_delivery: 'is out for delivery. Please keep your phone nearby.'
  };
  function waLink(o, shop) {
    const step = o.fulfillment_step || '';
    const msg = `Hello ${o.customer_name}, your order #${o.order_number} from ${shop.business_name || 'our shop'} ${STAGE_TEXT[step] || STAGE_TEXT['']}\nTotal: ${money(o.total)}`;
    return `https://wa.me/${waNumber(o.customer_phone)}?text=${encodeURIComponent(msg)}`;
  }

  /* ---------- Printing (delivery slip / bill) via a hidden iframe ---------- */
  function printDoc(html) {
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(f);
    const d = f.contentWindow.document;
    d.open(); d.write(html); d.close();
    const go = () => {
      try { f.contentWindow.focus(); f.contentWindow.print(); } catch { toast('Could not open the print dialog', 'error'); }
      setTimeout(() => f.remove(), 60000);
    };
    setTimeout(go, 250);
  }
  function docShell(title, inner) {
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
      @page { margin: 8mm; }
      * { box-sizing: border-box; }
      body { font: 13px/1.45 Arial, Helvetica, sans-serif; color: #000; max-width: 380px; margin: 0 auto; }
      h1 { font-size: 18px; margin: 0; text-align: center; }
      .c { text-align: center; } .muted { color: #444; }
      hr { border: 0; border-top: 1px dashed #000; margin: 10px 0; }
      table { width: 100%; border-collapse: collapse; }
      th, td { padding: 4px 0; text-align: left; vertical-align: top; }
      .n { text-align: right; white-space: nowrap; padding-left: 8px; }
      .tot td { border-top: 1px solid #000; font-weight: 700; font-size: 15px; padding-top: 6px; }
      .pre { white-space: pre-line; }
    </style></head><body>${inner}</body></html>`;
  }
  function slipHtml(o, shop) {
    const rows = (o.order_items || []).map(i => `<tr><td>${esc(i.product_name)}</td><td class="n">${esc(i.quantity)}</td></tr>`).join('');
    return docShell(`Slip #${o.order_number}`, `
      <h1>${esc(shop.business_name || 'Shop')}</h1><div class="c muted">Delivery slip</div><hr>
      <div><strong>Order #${esc(o.order_number)}</strong></div><div class="muted">${esc(fmtDate(o.created_at))}</div><hr>
      <div><strong>${esc(o.customer_name)}</strong></div><div>${esc(o.customer_phone)}</div>
      <div class="pre">${esc(o.delivery_address || 'No delivery address given')}</div><hr>
      <table><thead><tr><th>Item</th><th class="n">Qty</th></tr></thead><tbody>${rows}</tbody></table>`);
  }
  function billHtml(o, shop) {
    const rows = (o.order_items || []).map(i => `<tr><td>${esc(i.product_name)}</td><td class="n">${esc(i.quantity)}</td><td class="n">${money(i.unit_price)}</td><td class="n">${money(i.line_total)}</td></tr>`).join('');
    return docShell(`Bill #${o.order_number}`, `
      <h1>${esc(shop.business_name || 'Shop')}</h1>
      ${shop.contact_phone ? `<div class="c muted">${esc(shop.contact_phone)}</div>` : ''}<div class="c">Bill</div><hr>
      <div><strong>Order #${esc(o.order_number)}</strong></div><div class="muted">${esc(fmtDate(o.created_at))}</div>
      <div>${esc(o.customer_name)} &middot; ${esc(o.customer_phone)}</div><hr>
      <table><thead><tr><th>Item</th><th class="n">Qty</th><th class="n">Price</th><th class="n">Total</th></tr></thead>
      <tbody>${rows}<tr class="tot"><td colspan="3">Total</td><td class="n">${money(o.total)}</td></tr></tbody></table>
      <hr><div class="c">Thank you!</div>`);
  }

  function orderDetail(o, onChanged) {
    const items = o.order_items || [];
    const actions = ACTIONS[o.status] || [];
    const body = openSheet(`Order #${o.order_number}`, `
      <div class="row between"><span>${statusBadge(o.status)}</span><span class="muted small">${esc(fmtDate(o.created_at))}</span></div>

      <h3 class="mt">Customer</h3>
      <div><strong>${esc(o.customer_name)}</strong></div>
      <div class="muted">${esc(o.customer_phone)}</div>
      ${o.delivery_address ? `<div class="muted" style="white-space:pre-line">${esc(o.delivery_address)}</div>` : '<div class="muted small">No delivery address given</div>'}
      <div class="row wrap mt">
        <a class="btn btn-sm" href="tel:${esc('+'.repeat(/^\+/.test(o.customer_phone)) + digits(o.customer_phone))}"><i class="i i-phone"></i> Call</a>
        <a class="btn btn-sm" target="_blank" rel="noopener" href="https://wa.me/${esc(waNumber(o.customer_phone))}">WhatsApp</a>
      </div>

      <h3 class="mt">Items</h3>
      <div class="table-wrap"><table>
        <thead><tr><th>Product</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Total</th></tr></thead>
        <tbody>${items.map(i => `<tr><td>${esc(i.product_name)}</td><td class="num">${i.quantity}</td><td class="num">${money(i.unit_price)}</td><td class="num">${money(i.line_total)}</td></tr>`).join('')}</tbody>
      </table></div>
      <div class="summary-row summary-total"><span>Total</span><span>${money(o.total)}</span></div>
      <div class="row wrap mt">
        <button class="btn btn-sm" type="button" data-print="slip">Print delivery slip</button>
        <button class="btn btn-sm" type="button" data-print="bill">Print bill</button>
      </div>

      ${canStep(o) ? `<h3 class="mt">Delivery progress</h3>
        <div class="row wrap" id="steps">${STEPS.map(([v, l]) => `<button class="btn btn-sm ${(o.fulfillment_step || '') === v ? 'btn-primary' : ''}" data-step="${v}">${l}</button>`).join('')}</div>
        <p class="help">Customers see this live on their Orders page.</p>
        <div class="row wrap"><button class="btn btn-sm btn-success" type="button" id="wa-update"></button></div>
        <p class="help">Opens WhatsApp with the message ready. You tap Send there.</p>` : ''}

      ${actions.length ? `<div class="row wrap mt" id="actions">${actions.map(a => `<button class="btn ${a[2]}" data-status="${a[0]}">${esc(a[1])}</button>`).join('')}</div>
        <p class="help">Stock stays reserved while an order is open. Completing deducts it; rejecting or cancelling releases it.</p>`
        : '<p class="help mt">This order is closed.</p>'}
    `);

    $$('[data-print]', body).forEach(b => b.onclick = async () => {
      const shop = await getShop();
      printDoc(b.dataset.print === 'bill' ? billHtml(o, shop) : slipHtml(o, shop));
    });

    const waBtn = $('#wa-update', body);
    const waLabel = () => { if (waBtn) waBtn.textContent = `WhatsApp: send "${STEP_LABEL[o.fulfillment_step] || 'Accepted'}" update`; };
    waLabel();
    if (waBtn) waBtn.onclick = async () => {
      const shop = await getShop();
      window.open(waLink(o, shop), '_blank', 'noopener');
    };

    const stepBox = $('#steps', body);
    if (stepBox) stepBox.onclick = async e => {
      const btn = e.target.closest('[data-step]');
      if (!btn) return;
      const step = btn.dataset.step || null;
      await withBusy(btn, async () => {
        try {
          await Admin.setFulfillment(o.id, step);
          o.fulfillment_step = step;
          $$('[data-step]', stepBox).forEach(b => b.classList.toggle('btn-primary', (b.dataset.step || '') === (step || '')));
          toast('Customer can now see: ' + (step ? STEP_LABEL[step] : 'Accepted'), 'success');
          waLabel();
          onChanged();
        } catch (err) { toast(errMsg(err), 'error'); }
      });
    };

    const box = $('#actions', body);
    if (box) box.onclick = async e => {
      const btn = e.target.closest('[data-status]');
      if (!btn) return;
      const status = btn.dataset.status;
      const label = btn.textContent.trim();
      const risky = status === 'rejected' || status === 'cancelled';
      if (risky && !(await confirmDialog(`${label} order #${o.order_number}? Reserved stock will be released.`, label, true))) return;
      await withBusy(btn, async () => {
        try {
          await Admin.setOrderStatus(o.id, status);
          toast(`Order #${o.order_number} updated`, 'success');
          closeSheet(); onChanged();
        } catch (err) { toast(errMsg(err), 'error'); }
      });
    };
  }

  Tabs.push({
    key: 'orders', order: 3, label: 'Orders', ico: '<i class="i i-orders"></i>',
    async render(el) {
      let status = '';
      el.innerHTML = `
        <div class="tabs" id="o-filters">${STATUS_FILTERS.map(([v, l]) => `<button class="chip ${v === status ? 'active' : ''}" data-s="${v}">${l}</button>`).join('')}</div>
        <div id="o-list"></div>`;
      const list = $('#o-list');
      let rows = [];

      async function load() {
        list.innerHTML = '<div class="skeleton"></div>';
        try {
          rows = await Admin.orders({ status });
          list.innerHTML = rows.length ? rows.map(o => `
            <div class="card list-card" data-id="${esc(o.id)}" style="cursor:pointer">
              <div class="grow">
                <div class="row between"><div class="title">#${esc(o.order_number)} &middot; ${esc(o.customer_name)}</div>${stageBadge(o)}</div>
                <div class="muted small">${esc(o.customer_phone)} &middot; ${(o.order_items || []).length} item(s) &middot; ${esc(fmtDate(o.created_at))}</div>
                <div><strong>${money(o.total)}</strong></div>
              </div>
            </div>`).join('') : '<div class="empty"><div class="big"><i class="i i-orders"></i></div>No orders here yet.</div>';
        } catch (err) { list.innerHTML = `<div class="empty">${esc(errMsg(err))}</div>`; }
      }
      reloadList = load;

      $('#o-filters').onclick = e => {
        const b = e.target.closest('[data-s]'); if (!b) return;
        status = b.dataset.s;
        $$('#o-filters .chip').forEach(c => c.classList.toggle('active', c === b));
        load();
      };
      list.onclick = e => {
        const card = e.target.closest('.list-card'); if (!card) return;
        const o = rows.find(r => r.id === card.dataset.id);
        if (o) orderDetail(o, () => { load(); refreshBadge(); });
      };
      load();
    }
  });

  /* ---------- Pending-orders badge + realtime ---------- */
  async function refreshBadge() {
    const badge = $('#orders-badge');
    if (!badge) return;
    const { count, error } = await sb.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'pending');
    if (error) return;
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.hidden = !count;
  }

  function startRealtime() {
    refreshBadge();
    sb.channel('admin-orders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, payload => {
        const o = payload.new;
        toast(`New order #${o.order_number} received`, 'success');   // total is filled in a moment later
        try { if (navigator.vibrate) navigator.vibrate(120); } catch { /* ignore */ }
        refreshBadge();
        if (currentTab === 'orders' && reloadList) reloadList();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, () => {
        refreshBadge();
        if (currentTab === 'orders' && reloadList) reloadList();
      })
      .subscribe();
  }

  (window.onAdminReady = window.onAdminReady || []).push(startRealtime);
})();
