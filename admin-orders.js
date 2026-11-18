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
    confirmed:  [['processing', 'Mark processing', 'btn-primary'], ['completed', 'Complete', 'btn-success'], ['cancelled', 'Cancel order', 'btn-danger']],
    processing: [['completed', 'Complete', 'btn-success'], ['cancelled', 'Cancel order', 'btn-danger']]
  };

  let reloadList = null;   // set while the Orders tab is on screen

  function digits(phone) { return String(phone || '').replace(/\D/g, ''); }

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
        <a class="btn btn-sm" href="tel:${esc('+'.repeat(/^\+/.test(o.customer_phone)) + digits(o.customer_phone))}">&#128222; Call</a>
        <a class="btn btn-sm" target="_blank" rel="noopener" href="https://wa.me/${esc(digits(o.customer_phone))}">WhatsApp</a>
      </div>

      <h3 class="mt">Items</h3>
      <div class="table-wrap"><table>
        <thead><tr><th>Product</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Total</th></tr></thead>
        <tbody>${items.map(i => `<tr><td>${esc(i.product_name)}</td><td class="num">${i.quantity}</td><td class="num">${money(i.unit_price)}</td><td class="num">${money(i.line_total)}</td></tr>`).join('')}</tbody>
      </table></div>
      <div class="summary-row summary-total"><span>Total</span><span>${money(o.total)}</span></div>

      ${actions.length ? `<div class="row wrap mt" id="actions">${actions.map(a => `<button class="btn ${a[2]}" data-status="${a[0]}">${esc(a[1])}</button>`).join('')}</div>
        <p class="help">Stock stays reserved while an order is open. Completing deducts it; rejecting or cancelling releases it.</p>`
        : '<p class="help mt">This order is closed.</p>'}
    `);

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
    key: 'orders', order: 3, label: 'Orders', ico: '&#128221;',
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
                <div class="row between"><div class="title">#${esc(o.order_number)} &middot; ${esc(o.customer_name)}</div>${statusBadge(o.status)}</div>
                <div class="muted small">${esc(o.customer_phone)} &middot; ${(o.order_items || []).length} item(s) &middot; ${esc(fmtDate(o.created_at))}</div>
                <div><strong>${money(o.total)}</strong></div>
              </div>
            </div>`).join('') : '<div class="empty"><div class="big">&#128221;</div>No orders here yet.</div>';
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
