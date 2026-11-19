/* =====================================================================
   admin-reports.js - Reports tab (admin part 3)
   Orders-per-day chart, stock movement history, CSV exports (Excel opens CSV).
   ===================================================================== */

(function () {
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const stamp = iso => { const d = new Date(iso); return `${ymd(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const num = v => Number(v || 0);
  const round2 = v => Math.round(v * 100) / 100;

  function rangeISO(from, to) {
    return {
      from: from ? new Date(from + 'T00:00:00').toISOString() : '',
      to: to ? new Date(to + 'T23:59:59.999').toISOString() : ''
    };
  }

  function csvName(base) { return `${base}-${ymd(new Date())}.csv`; }

  /* ---------- Report builders: each returns {name, rows} ---------- */
  const REPORTS = [
    { key: 'stock', label: 'Current stock', async build() {
        const ps = await Admin.products();
        return { name: 'current-stock', rows: ps.map(p => ({
          SKU: p.sku || '', Product: p.name, Category: p.categories?.name || '',
          'On hand': p.quantity, Reserved: p.reserved_quantity, Available: p.quantity - p.reserved_quantity,
          'Min alert': p.min_stock_alert, Status: p.status })) };
    } },
    { key: 'products', label: 'Product list', async build() {
        const ps = await Admin.products();
        return { name: 'product-list', rows: ps.map(p => ({
          ID: p.id, SKU: p.sku || '', Product: p.name, Brand: p.brand || '', Category: p.categories?.name || '',
          'Purchase price': p.purchase_price, 'Selling price': p.selling_price, Status: p.status,
          Created: stamp(p.created_at), Updated: stamp(p.updated_at) })) };
    } },
    { key: 'low', label: 'Low stock', async build() {
        const ps = (await Admin.products()).filter(p => p.status !== 'archived' && p.quantity <= p.min_stock_alert);
        return { name: 'low-stock', rows: ps.map(p => ({
          SKU: p.sku || '', Product: p.name, 'On hand': p.quantity, 'Min alert': p.min_stock_alert,
          Level: p.quantity === 0 ? 'Out of stock' : 'Low' })) };
    } },
    { key: 'valuation', label: 'Inventory valuation', async build() {
        const ps = (await Admin.products()).filter(p => p.status !== 'archived');
        const rows = ps.map(p => ({
          SKU: p.sku || '', Product: p.name, Quantity: p.quantity,
          'Purchase value': round2(p.quantity * num(p.purchase_price)),
          'Selling value': round2(p.quantity * num(p.selling_price)),
          'Potential profit': round2(p.quantity * (num(p.selling_price) - num(p.purchase_price))) }));
        rows.push({ SKU: '', Product: 'TOTAL', Quantity: rows.reduce((a, r) => a + r.Quantity, 0),
          'Purchase value': round2(rows.reduce((a, r) => a + r['Purchase value'], 0)),
          'Selling value': round2(rows.reduce((a, r) => a + r['Selling value'], 0)),
          'Potential profit': round2(rows.reduce((a, r) => a + r['Potential profit'], 0)) });
        return { name: 'inventory-valuation', rows };
    } },
    { key: 'movements', label: 'Stock movements', async build() {
        const ms = await Admin.movements({ limit: 5000 });
        return { name: 'stock-movements', rows: ms.map(m => ({
          Date: stamp(m.created_at), Product: m.products?.name || '', SKU: m.products?.sku || '', Type: m.movement_type,
          'Stock change': m.quantity_change, 'Reserved change': m.reserved_change,
          'Stock after': m.quantity_after, 'Reserved after': m.reserved_after, Reason: m.reason || '' })) };
    } },
    { key: 'orders', label: 'Orders', needsRange: true, async build(r) {
        const os = await Admin.orders({ ...r, limit: 5000 });
        return { name: 'orders', rows: os.map(o => ({
          Order: o.order_number, Date: stamp(o.created_at), Customer: o.customer_name, Phone: o.customer_phone,
          Address: o.delivery_address || '', Status: o.status, Stage: o.fulfillment_step || '',
          Items: (o.order_items || []).map(i => `${i.product_name} x${i.quantity}`).join('; '), Total: o.total })) };
    } },
    { key: 'profit', label: 'Profit by product', needsRange: true, async build(r) {
        const d = await profitData(r);
        const rows = d.rows.map(g => ({
          Product: g.name, 'Qty sold': g.qty, Sales: round2(g.revenue), Cost: round2(g.cost),
          Profit: round2(g.profit), 'Margin %': g.revenue ? round2(g.profit / g.revenue * 100) : 0 }));
        if (rows.length) rows.push({ Product: 'TOTAL', 'Qty sold': d.rows.reduce((a, g) => a + g.qty, 0),
          Sales: round2(d.revenue), Cost: round2(d.cost), Profit: round2(d.profit),
          'Margin %': d.revenue ? round2(d.profit / d.revenue * 100) : 0 });
        return { name: 'profit-by-product', rows };
    } },
    { key: 'daily', label: 'Daily orders', needsRange: true, async build(r) {
        return { name: 'daily-orders', rows: group(await Admin.orders({ ...r, limit: 5000 }), o => ymd(new Date(o.created_at)), 'Date') };
    } },
    { key: 'monthly', label: 'Monthly orders', needsRange: true, async build(r) {
        return { name: 'monthly-orders', rows: group(await Admin.orders({ ...r, limit: 5000 }), o => ymd(new Date(o.created_at)).slice(0, 7), 'Month') };
    } }
  ];

  /* ---------- Profit: completed orders only; cost = product's CURRENT purchase price ---------- */
  async function profitData(r) {
    const [orders, products] = await Promise.all([
      Admin.orders({ ...r, status: 'completed', limit: 5000 }),
      Admin.products()
    ]);
    const cost = Object.fromEntries(products.map(p => [p.id, num(p.purchase_price)]));
    const byProduct = {};
    let revenue = 0, costTotal = 0, unknown = 0;
    for (const o of orders) {
      for (const i of (o.order_items || [])) {
        const qty = num(i.quantity), rev = num(i.line_total);
        const known = !!i.product_id && (i.product_id in cost);
        const c = known ? cost[i.product_id] * qty : 0;
        if (!known) unknown++;
        revenue += rev; costTotal += c;
        const k = i.product_id || ('name:' + i.product_name);
        const g = byProduct[k] || (byProduct[k] = { name: i.product_name, qty: 0, revenue: 0, cost: 0 });
        g.qty += qty; g.revenue += rev; g.cost += c;
      }
    }
    const rows = Object.values(byProduct)
      .map(g => ({ ...g, profit: g.revenue - g.cost }))
      .sort((a, b) => b.profit - a.profit);
    return { orders: orders.length, revenue, cost: costTotal, profit: revenue - costTotal, unknown, rows };
  }

  function group(orders, keyFn, label) {
    const map = {};
    for (const o of orders) {
      const k = keyFn(o);
      const g = map[k] || (map[k] = { [label]: k, Orders: 0, Completed: 0, 'Completed value': 0, 'Cancelled/Rejected': 0, 'All orders value': 0 });
      g.Orders++;
      g['All orders value'] = round2(g['All orders value'] + num(o.total));
      if (o.status === 'completed') { g.Completed++; g['Completed value'] = round2(g['Completed value'] + num(o.total)); }
      if (o.status === 'cancelled' || o.status === 'rejected') g['Cancelled/Rejected']++;
    }
    return Object.values(map).sort((a, b) => a[label].localeCompare(b[label]));
  }

  /* ---------- Tab ---------- */
  Tabs.push({
    key: 'reports', order: 4, label: 'Reports', ico: '<i class="i i-report"></i>',
    async render(el) {
      const today = new Date();
      const start = new Date(today); start.setDate(start.getDate() - 29);
      el.innerHTML = `
        <div class="card">
          <h2>Orders per day</h2>
          <div class="row wrap mb">
            <label class="field" style="margin:0"><span>From</span><input class="input" type="date" id="r-from" value="${ymd(start)}"></label>
            <label class="field" style="margin:0"><span>To</span><input class="input" type="date" id="r-to" value="${ymd(today)}"></label>
          </div>
          <div id="chart"><div class="skeleton" style="min-height:160px"></div></div>
        </div>

        <div class="card mt">
          <h2>Profit</h2>
          <p class="help">Delivered (completed) orders in the date range above. Cost uses each product's current purchase price.</p>
          <div id="profit"><div class="skeleton" style="min-height:120px"></div></div>
        </div>

        <div class="card mt">
          <h2>Download reports</h2>
          <p class="help">CSV files open in Excel and Google Sheets. Order reports use the date range above.</p>
          <div class="row wrap" id="downloads">
            ${REPORTS.map(r => `<button class="btn btn-sm" data-r="${r.key}"><i class="i i-download"></i> ${esc(r.label)}${r.needsRange ? ' *' : ''}</button>`).join('')}
          </div>
          <p class="help">* uses the date range</p>
        </div>

        <div class="card mt">
          <div class="row between wrap"><h2 style="margin:0">Stock history</h2>
            <select class="input" id="m-product" style="max-width:240px"><option value="">All products</option></select></div>
          <div id="m-list" class="mt"></div>
        </div>`;

      const from = $('#r-from'), to = $('#r-to');

      async function drawChart() {
        const box = $('#chart');
        try {
          const r = rangeISO(from.value, to.value);
          const orders = await Admin.orders({ ...r, limit: 5000 });
          const days = []; const counts = {};
          for (let d = new Date(from.value + 'T00:00:00'); d <= new Date(to.value + 'T00:00:00') && days.length < 62; d.setDate(d.getDate() + 1)) {
            const k = ymd(d); days.push(k); counts[k] = 0;
          }
          orders.forEach(o => { const k = ymd(new Date(o.created_at)); if (k in counts) counts[k]++; });
          const max = Math.max(1, ...Object.values(counts));
          box.innerHTML = days.length ? `
            <div class="bars">${days.map(k => `<div class="bar" style="height:${(counts[k] / max) * 100}%" title="${k}: ${counts[k]} order(s)"></div>`).join('')}</div>
            <div class="bar-labels">${days.map((k, i) => `<span>${days.length <= 16 || i % 5 === 0 ? k.slice(8) : ''}</span>`).join('')}</div>
            <p class="help">${orders.length} order(s) in this range &middot; busiest day: ${max}</p>`
            : '<div class="empty">Pick a valid date range.</div>';
        } catch (err) { box.innerHTML = `<div class="empty">${esc(errMsg(err))}</div>`; }
      }
      async function drawProfit() {
        const box = $('#profit');
        try {
          try { await Shop.settings(); } catch { /* keep default currency */ }
          const d = await profitData(rangeISO(from.value, to.value));
          if (!d.orders) { box.innerHTML = '<div class="empty">No delivered orders in this range.</div>'; return; }
          const margin = d.revenue ? (d.profit / d.revenue * 100) : 0;
          box.innerHTML = `
            <div class="summary-row"><span>Sales (${d.orders} order${d.orders === 1 ? '' : 's'})</span><span>${money(d.revenue)}</span></div>
            <div class="summary-row"><span>Cost</span><span>${money(d.cost)}</span></div>
            <div class="summary-row summary-total"><span>Profit</span><span>${money(d.profit)} &middot; ${margin.toFixed(1)}%</span></div>
            <div class="table-wrap mt"><table>
              <thead><tr><th>Product</th><th class="num">Qty</th><th class="num">Sales</th><th class="num">Profit</th></tr></thead>
              <tbody>${d.rows.slice(0, 10).map(g => `<tr><td>${esc(g.name)}</td><td class="num">${g.qty}</td><td class="num">${money(g.revenue)}</td><td class="num">${money(g.profit)}</td></tr>`).join('')}</tbody>
            </table></div>
            <p class="help">${d.rows.length > 10 ? 'Top 10 by profit shown. ' : ''}Download "Profit by product" for the full list.${d.unknown ? ` ${d.unknown} item(s) have no product record, so their cost counts as 0.` : ''}</p>`;
        } catch (err) { box.innerHTML = `<div class="empty">${esc(errMsg(err))}</div>`; }
      }
      from.onchange = () => { drawChart(); drawProfit(); };
      to.onchange = () => { drawChart(); drawProfit(); };

      $('#downloads').onclick = async e => {
        const btn = e.target.closest('[data-r]'); if (!btn) return;
        const rep = REPORTS.find(r => r.key === btn.dataset.r);
        await withBusy(btn, async () => {
          try {
            const { name, rows } = await rep.build(rangeISO(from.value, to.value));
            if (!rows.length) return toast('Nothing to export yet', 'error');
            downloadFile(csvName(name), toCSV(rows));
          } catch (err) { toast(errMsg(err), 'error'); }
        });
      };

      // Stock history
      const sel = $('#m-product'), mlist = $('#m-list');
      try {
        const ps = await Admin.products();
        sel.insertAdjacentHTML('beforeend', ps.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join(''));
      } catch (e) { console.error(e); }

      async function loadMovements() {
        mlist.innerHTML = '<div class="skeleton" style="min-height:100px"></div>';
        try {
          const ms = await Admin.movements({ productId: sel.value, limit: 100 });
          mlist.innerHTML = ms.length ? `<div class="table-wrap"><table>
            <thead><tr><th>Date</th><th>Product</th><th>Type</th><th class="num">Stock</th><th class="num">Reserved</th><th class="num">After</th><th>Note</th></tr></thead>
            <tbody>${ms.map(m => `<tr>
              <td class="nowrap">${esc(stamp(m.created_at))}</td><td>${esc(m.products?.name || '')}</td><td><span class="badge">${esc(m.movement_type)}</span></td>
              <td class="num">${m.quantity_change > 0 ? '+' : ''}${m.quantity_change}</td><td class="num">${m.reserved_change > 0 ? '+' : ''}${m.reserved_change}</td>
              <td class="num">${m.quantity_after}</td><td>${esc(m.reason || '')}</td></tr>`).join('')}</tbody></table></div>
            <p class="help">Showing the latest 100. Download "Stock movements" for the full log.</p>`
            : '<div class="empty">No stock movements yet.</div>';
        } catch (err) { mlist.innerHTML = `<div class="empty">${esc(errMsg(err))}</div>`; }
      }
      sel.onchange = loadMovements;

      drawChart();
      drawProfit();
      loadMovements();
    }
  });
})();
