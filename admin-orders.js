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

  /* ---------- Printing (delivery slip / bill) ----------
     The page itself is printed: while printing, everything except #print-area is hidden.
     (Printing from a hidden iframe is unreliable on phones.) */
  const PRINT_CSS = `
    #print-area { display: none; }
    @media print {
      @page { margin: 8mm; }
      html, body.printing-doc { background: #fff !important; height: auto !important; overflow: visible !important; }
      body.printing-doc > *:not(#print-area) { display: none !important; }
      body.printing-doc #print-area { display: block !important; max-width: 380px; margin: 0 auto; background: #fff; color: #000;
        font: 13px/1.45 Arial, Helvetica, sans-serif; }
      #print-area * { color: #000 !important; box-shadow: none !important; }
      #print-area h1 { font-size: 18px; margin: 0; text-align: center; }
      #print-area .c { text-align: center; } #print-area .muted { color: #444 !important; }
      #print-area hr { border: 0; border-top: 1px dashed #000; margin: 10px 0; }
      #print-area table { width: 100%; border-collapse: collapse; }
      #print-area th, #print-area td { padding: 4px 0; text-align: left; vertical-align: top; border: 0; }
      #print-area .n { text-align: right; white-space: nowrap; padding-left: 8px; }
      #print-area .tot td { border-top: 1px solid #000; font-weight: 700; font-size: 15px; padding-top: 6px; }
      #print-area .pre { white-space: pre-line; }
    }`;
  function printDoc(innerHtml) {
    if (!document.getElementById('print-style')) {
      const st = document.createElement('style');
      st.id = 'print-style'; st.textContent = PRINT_CSS;
      document.head.appendChild(st);
    }
    let area = document.getElementById('print-area');
    if (!area) { area = document.createElement('div'); area.id = 'print-area'; document.body.appendChild(area); }
    area.innerHTML = innerHtml;
    const finish = () => {
      document.body.classList.remove('printing-doc');
      area.replaceChildren();
      window.removeEventListener('afterprint', finish);
    };
    document.body.classList.add('printing-doc');
    window.addEventListener('afterprint', finish, { once: true });
    try { window.print(); } catch {
      finish();
      toast('Printing is unavailable. Open the PDF from the order to print it.', 'error');
    }
  }
  function docShell(title, inner) { return inner; }
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
      <tbody>${rows}<tr><td colspan="3">Discount</td><td class="n">−${money(o.discount_total||0)}</td></tr><tr><td colspan="3">Delivery</td><td class="n">${money(o.delivery_charge||0)}</td></tr><tr class="tot"><td colspan="3">Total</td><td class="n">${money(o.total)}</td></tr></tbody></table>
      <hr><div class="c">Thank you!</div>`);
  }

  /* ---------- Share bill (PDF) ----------
     Builds a small PDF here (standard Helvetica font, English text), so no PDF library is needed.
     Opens the native share sheet when the browser can share files; otherwise downloads the PDF. */
  const PDF_W = 595, PDF_H = 842;                       // A4, in points
  // Helvetica character widths (1/1000 em) for ASCII 32..126, used to align and wrap text.
  const HELV_W = [
    278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
    278, 278, 584, 584, 584, 556, 1015,
    667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611,
    278, 278, 278, 469, 556, 333,
    556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500,
    334, 260, 334, 584];
  const HELV_BOLD_W = [
    278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
    333, 333, 584, 584, 584, 611, 975,
    722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611,
    333, 278, 333, 584, 556, 333,
    556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500,
    389, 280, 389, 584];
  const PDF_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Plain printable ASCII only (the built-in PDF font cannot draw anything else).
  function pdfText(v) {
    return String(v == null ? '' : v)
      .replace(/[​-‍﻿]/g, '')
      .replace(/[‘’‛]/g, "'").replace(/[“”]/g, '"')
      .replace(/[–—−]/g, '-').replace(/…/g, '...').replace(/×/g, 'x')
      .replace(/\s+/g, ' ')
      .normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/[^\x20-\x7E]/g, '?')
      .trim();
  }
  function pdfWidth(s, size, bold) {
    const t = bold ? HELV_BOLD_W : HELV_W;
    let w = 0;
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); w += (c >= 32 && c <= 126) ? t[c - 32] : 556; }
    return w * size / 1000;
  }
  function pdfWrap(s, maxW, size, bold) {
    const lines = []; let line = '';
    for (let w of s.split(' ')) {
      while (pdfWidth(w, size, bold) > maxW && w.length > 1) {      // a single very long word
        let k = w.length;
        while (k > 1 && pdfWidth(w.slice(0, k), size, bold) > maxW) k--;
        if (line) { lines.push(line); line = ''; }
        lines.push(w.slice(0, k)); w = w.slice(k);
      }
      const test = line ? line + ' ' + w : w;
      if (pdfWidth(test, size, bold) <= maxW) line = test;
      else { if (line) lines.push(line); line = w; }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  }
  function pdfFit(s, maxW, sizes, bold) {                           // biggest size that fits, else shorten
    for (const size of sizes) if (pdfWidth(s, size, bold) <= maxW) return { text: s, size };
    const size = sizes[sizes.length - 1];
    let t = s;
    while (t.length > 1 && pdfWidth(t + '...', size, bold) > maxW) t = t.slice(0, -1);
    return { text: t + '...', size };
  }
  function pdfMoney(v, cur) {
    const n = Number(v);
    return `${cur} ${(isFinite(n) ? n : 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  }
  function pdfDate(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const p = n => String(n).padStart(2, '0');
    return `${d.getDate()} ${PDF_MONTHS[d.getMonth()]} ${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  // Tiny PDF writer: pages hold drawing commands; finish() returns the file bytes.
  function pdfDoc() {
    const pages = [];
    let cmds = null;
    const f = n => n.toFixed(2);
    const col = c => c.map(f).join(' ');
    const pdfEsc = s => s.replace(/[\\()]/g, '\\$&');
    return {
      addPage() { cmds = []; pages.push(cmds); },
      use(i) { cmds = pages[i]; },
      count() { return pages.length; },
      rect(x, y, w, h, c) { cmds.push(`${col(c)} rg ${f(x)} ${f(PDF_H - y - h)} ${f(w)} ${f(h)} re f`); },
      line(x1, y1, x2, y2, c, w) { cmds.push(`${col(c)} RG ${f(w || 0.6)} w ${f(x1)} ${f(PDF_H - y1)} m ${f(x2)} ${f(PDF_H - y2)} l S`); },
      text(s, x, y, o) {                                            // y = text baseline, measured from the top
        o = o || {};
        s = pdfText(s);
        const size = o.size || 10, bold = !!o.bold, w = pdfWidth(s, size, bold);
        const px = o.align === 'right' ? x - w : o.align === 'center' ? x - w / 2 : x;
        cmds.push(`BT /${bold ? 'F2' : 'F1'} ${f(size)} Tf ${col(o.color || [0, 0, 0])} rg ${f(px)} ${f(PDF_H - y)} Td (${pdfEsc(s)}) Tj ET`);
      },
      finish(title) {
        const objs = [null];
        objs.push('<< /Type /Catalog /Pages 2 0 R >>');
        objs.push(`<< /Type /Pages /Kids [${pages.map((_, i) => `${5 + 2 * i} 0 R`).join(' ')}] /Count ${pages.length} >>`);
        objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
        objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
        pages.forEach((c, i) => {
          const stream = c.join('\n');
          objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_W} ${PDF_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + 2 * i} 0 R >>`);
          objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
        });
        objs.push(`<< /Title (${pdfEsc(pdfText(title))}) /Producer (FZ Cart) >>`);
        let out = '%PDF-1.4\n%âãÏÓ\n';
        const offs = [];
        for (let i = 1; i < objs.length; i++) { offs[i] = out.length; out += `${i} 0 obj\n${objs[i]}\nendobj\n`; }
        const xref = out.length;
        out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
        for (let i = 1; i < objs.length; i++) out += `${String(offs[i]).padStart(10, '0')} 00000 n \n`;
        out += `trailer\n<< /Size ${objs.length} /Root 1 0 R /Info ${objs.length - 1} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
        const bytes = new Uint8Array(out.length);
        for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
        return bytes;
      }
    };
  }

  function buildBillPdf(o, shop) {
    shop = shop || {};
    const M = 40, R = PDF_W - M, CW = R - M, BOTTOM = PDF_H - 56;
    const INK = [0.1, 0.1, 0.1], MUTED = [0.4, 0.4, 0.4], RULE = [0.82, 0.82, 0.82], SHADE = [0.94, 0.94, 0.94];
    const BAND = [0.12, 0.16, 0.2], WHITE = [1, 1, 1], SOFT = [0.8, 0.84, 0.88];
    const TOTAL_R = R - 8, PRICE_R = TOTAL_R - 95, QTY_R = PRICE_R - 95, ITEM_X = M + 8, ITEM_W = QTY_R - 45 - ITEM_X;

    let cur = pdfText(shop.currency || shop.currency_code);
    if (!cur || cur.indexOf('?') >= 0) cur = 'AED';
    const shopName = pdfText(shop.business_name) || 'Shop';
    const orderNo = pdfText(o.order_number);
    const items = (o.order_items || []).map(i => {
      const qty = Number(i.quantity) || 0, unit = Number(i.unit_price) || 0;
      const line = (i.line_total != null && isFinite(Number(i.line_total))) ? Number(i.line_total) : qty * unit;
      return { name: pdfText(i.product_name) || 'Item', qty, unit, line };
    });
    const total = (o.total != null && isFinite(Number(o.total))) ? Number(o.total) : items.reduce((a, r) => a + r.line, 0);

    const doc = pdfDoc();
    doc.addPage();

    // Header band: shop name and contact details
    const contact = [];
    const phone = pdfText(shop.contact_phone); if (phone) contact.push('Tel: ' + phone);
    const mail = pdfText(shop.contact_email || shop.email); if (mail) contact.push(mail);
    const addr = pdfText(shop.address || shop.business_address);
    if (addr) pdfWrap(addr, 340, 9.5, false).slice(0, 2).forEach(l => contact.push(l));
    const lastBase = contact.length ? 66 + (contact.length - 1) * 13 : 46;
    doc.rect(0, 0, PDF_W, lastBase + 18, BAND);
    const nm = pdfFit(shopName, 360, [20, 17, 14], true);
    doc.text(nm.text, M, 46, { size: nm.size, bold: true, color: WHITE });
    doc.text('BILL', R, 46, { size: 20, bold: true, color: WHITE, align: 'right' });
    contact.forEach((c, k) => doc.text(c, M, 66 + k * 13, { size: 9.5, color: SOFT }));

    // Customer (left) and order number / date (right)
    let y = lastBase + 18 + 30;
    doc.text('BILL TO', M, y, { size: 8.5, bold: true, color: MUTED });
    doc.text('ORDER', R, y, { size: 8.5, bold: true, color: MUTED, align: 'right' });
    let ly = y + 17;
    pdfWrap(pdfText(o.customer_name) || 'Customer', 260, 12, true).slice(0, 2).forEach(l => {
      doc.text(l, M, ly, { size: 12, bold: true, color: INK }); ly += 15;
    });
    const cphone = pdfText(o.customer_phone);
    if (cphone) { doc.text(cphone, M, ly, { size: 10.5, color: INK }); ly += 14; }
    doc.text('#' + orderNo, R, y + 17, { size: 12, bold: true, color: INK, align: 'right' });
    const when = pdfDate(o.created_at);
    if (when) doc.text(when, R, y + 32, { size: 10.5, color: INK, align: 'right' });
    y = Math.max(ly, y + 32) + 18;

    const tableHead = () => {
      doc.rect(M, y, CW, 22, SHADE);
      const b = y + 15, st = { size: 9, bold: true, color: MUTED };
      doc.text('ITEM', ITEM_X, b, st);
      doc.text('QTY', QTY_R, b, { ...st, align: 'right' });
      doc.text('UNIT PRICE', PRICE_R, b, { ...st, align: 'right' });
      doc.text('TOTAL', TOTAL_R, b, { ...st, align: 'right' });
      y += 22;
    };
    const newPage = withHead => {
      doc.addPage();
      doc.text(pdfFit(shopName, 320, [11], true).text, M, 42, { size: 11, bold: true, color: INK });
      doc.text('Order #' + orderNo + ' (continued)', R, 42, { size: 9.5, color: MUTED, align: 'right' });
      doc.line(M, 52, R, 52, RULE, 0.8);
      y = 70;
      if (withHead) tableHead();
    };

    // Items: product, quantity, unit price, line total
    tableHead();
    items.forEach(it => {
      const lines = pdfWrap(it.name, ITEM_W, 10, false);
      const h = lines.length * 13 + 12;
      if (y + h > BOTTOM) newPage(true);
      const b = y + 15;
      lines.forEach((l, k) => doc.text(l, ITEM_X, b + k * 13, { size: 10, color: INK }));
      doc.text(String(it.qty), QTY_R, b, { size: 10, color: INK, align: 'right' });
      doc.text(pdfMoney(it.unit, cur), PRICE_R, b, { size: 10, color: INK, align: 'right' });
      doc.text(pdfMoney(it.line, cur), TOTAL_R, b, { size: 10, color: INK, align: 'right' });
      y += h;
      doc.line(M, y, R, y, RULE, 0.6);
    });
    if (!items.length) {
      doc.text('No items', ITEM_X, y + 15, { size: 10, color: MUTED });
      y += 28; doc.line(M, y, R, y, RULE, 0.6);
    }

    if (y + 160 > BOTTOM) newPage(false);
    y += 20; doc.text('Discount', ITEM_X, y, {size:10});doc.text(pdfMoney(-(o.discount_total||0),cur),TOTAL_R,y,{size:10,align:'right'});
    y += 18; doc.text('Delivery', ITEM_X, y, {size:10});doc.text(pdfMoney(o.delivery_charge||0,cur),TOTAL_R,y,{size:10,align:'right'});
    // Grand total and thank-you message
    if (y + 120 > BOTTOM) newPage(false);
    y += 14;
    doc.rect(M, y, CW, 34, SHADE);
    doc.text('Grand total', ITEM_X, y + 22, { size: 13, bold: true, color: INK });
    doc.text(pdfMoney(total, cur), TOTAL_R, y + 22, { size: 13, bold: true, color: INK, align: 'right' });
    y += 34 + 36;
    doc.text('Thank you for your order!', PDF_W / 2, y, { size: 13, bold: true, color: INK, align: 'center' });
    const ty = pdfFit('Thank you for shopping with ' + shopName, CW, [10], false);
    doc.text(ty.text, PDF_W / 2, y + 18, { size: 10, color: MUTED, align: 'center' });

    const n = doc.count();
    if (n > 1) for (let k = 0; k < n; k++) {
      doc.use(k);
      doc.text(`Page ${k + 1} of ${n}`, PDF_W / 2, PDF_H - 28, { size: 8.5, color: MUTED, align: 'center' });
    }
    return doc.finish('Bill - Order #' + orderNo);
  }

  function slipPdf(order, shop) {
    const doc = pdfDoc();
    let y = 50;
    doc.addPage();
    function line(value, size = 12, bold = false) {
      for (const row of pdfWrap(pdfText(value), PDF_W - 80, size, bold)) {
        if (y > PDF_H - 48) { doc.addPage(); y = 50; }
        doc.text(row, 40, y, {size, bold});
        y += size + 7;
      }
    }
    line(shop.business_name || 'Shop', 18, true);
    line('Delivery slip - Order #' + order.order_number, 15, true);
    line(pdfDate(order.created_at));
    line(order.customer_name);
    line(order.customer_phone);
    for (const part of (order.delivery_address || 'No delivery address given').split(/\r?\n/)) line(part);
    y += 12;
    line('Items and quantities', 13, true);
    for (const item of order.order_items || []) line(item.quantity + ' x ' + item.product_name);
    return new Blob([doc.finish('Delivery slip - Order #' + order.order_number)], {type:'application/pdf'});
  }

  function billPdfFile(o, shop) {
    const bytes = buildBillPdf(o, shop);
    const no = String(o.order_number == null ? '' : o.order_number).replace(/[^A-Za-z0-9_-]+/g, '');
    const name = `FZ-Cart-Bill-Order-${no || 'Bill'}.pdf`;
    try { return new File([bytes], name, { type: 'application/pdf' }); }
    catch { const b = new Blob([bytes], { type: 'application/pdf' }); b.name = name; return b; }   // very old browsers
  }

  function downloadPdf(file) {
    const url = URL.createObjectURL(file);
    if ('download' in document.createElement('a')) {
      const a = document.createElement('a');
      a.href = url; a.download = file.name; a.style.display = 'none';
      document.body.appendChild(a); a.click(); a.remove();
    } else {
      window.open(url, '_blank');                                   // no download support: open it so it can be saved
    }
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  }

  async function shareBillPdf(o, shop) {
    const file = billPdfFile(o, shop);
    let canShareFile = false;
    try { canShareFile = !!(navigator.share && navigator.canShare && navigator.canShare({ files: [file] })); } catch { canShareFile = false; }
    if (canShareFile) {
      try {
        await navigator.share({ files: [file], title: `Bill - Order #${o.order_number}` });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;               // they closed the share sheet: nothing to report
        console.warn('Share sheet failed, downloading instead', err);
      }
    }
    downloadPdf(file);
    toast(canShareFile
      ? 'Could not open the share sheet, so the bill PDF was downloaded instead.'
      : 'Sharing files is not supported on this browser, so the bill PDF was downloaded. You can send it from your downloads.', 'success');
  }
  /* ---------- end Share bill (PDF) ---------- */

  function orderDetail(o, onChanged) {
    const items = o.order_items || [];
    const actions = ACTIONS[o.status] || [];
    const body = openSheet(`Order #${o.order_number}`, `
      <div class="row between"><span>${statusBadge(o.status)}</span><span class="muted small">${esc(fmtDate(o.created_at))}</span></div>

      <div class="row wrap mt">
        <button class="btn btn-sm" type="button" data-print="slip">Print delivery slip</button>
        <button class="btn btn-sm" type="button" data-print="bill">Print bill</button>
        <button class="btn btn-sm" type="button" data-preview="bill">View bill PDF</button>
        <button class="btn btn-sm" type="button" data-preview="slip">View delivery slip PDF</button>
        <button class="btn btn-sm" type="button" id="share-bill">Share bill (PDF)</button>
      </div>
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
      <div class="summary-row"><span>Subtotal</span><span>${money(o.subtotal??items.reduce((n,i)=>n+Number(i.line_total),0))}</span></div><div class="summary-row"><span>Discount</span><span>−${money(o.discount_total||0)}</span></div><div class="summary-row"><span>Delivery</span><span>${money(o.delivery_charge||0)}</span></div><div class="summary-row summary-total"><span>Total</span><span>${money(o.total)}</span></div>


      ${canStep(o) ? `<h3 class="mt">Delivery progress</h3>
        <div class="row wrap" id="steps">${STEPS.map(([v, l]) => `<button class="btn btn-sm ${(o.fulfillment_step || '') === v ? 'btn-primary' : ''}" data-step="${v}">${l}</button>`).join('')}</div>
        <p class="help">Customers see this live on their Orders page.</p>
        <div class="row wrap"><button class="btn btn-sm btn-success" type="button" id="wa-update"></button></div>
        <p class="help">Opens WhatsApp with the message ready. You tap Send there.</p>` : ''}

      ${actions.length ? `<div class="row wrap mt" id="actions">${actions.map(a => `<button class="btn ${a[2]}" data-status="${a[0]}">${esc(a[1])}</button>`).join('')}</div>
        <p class="help">Stock stays reserved while an order is open. Completing deducts it; rejecting or cancelling releases it.</p>`
        : '<p class="help mt">This order is closed.</p>'}
    `);

    const documentButtons = $$('[data-print], [data-preview]', body);
    for (const button of documentButtons) {
      button.onclick = () => {
        // Keep print and PDF opening inside the tap, even while settings are loading.
        const shop = shopCfg || { business_name: 'FC Cart' };
        if (button.dataset.print) {
          printDoc(button.dataset.print === 'bill' ? billHtml(o, shop) : slipHtml(o, shop));
          return;
        }
        const file = button.dataset.preview === 'bill' ? billPdfFile(o, shop) : slipPdf(o, shop);
        const url = URL.createObjectURL(file);
        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      };
    }
    void getShop();
    const shareBtn = $('#share-bill', body);
    if (shareBtn) shareBtn.onclick = () => withBusy(shareBtn, async () => {
      try {
        const shop = shopCfg || await getShop();
        await shareBillPdf(o, shop);
      } catch (err) {
        console.error(err);
        toast('Could not create the bill PDF. ' + errMsg(err), 'error');
      }
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
      let rows = [], loadVersion=0;

      async function load() {
        const version=++loadVersion;
        list.innerHTML = '<div class="skeleton"></div>';
        try {
          const next = await Admin.orders({ status });
          if(version!==loadVersion||!list.isConnected)return;rows=next;
          list.innerHTML = rows.length ? rows.map(o => `
            <div class="card list-card" data-id="${esc(o.id)}" style="cursor:pointer" role="button" tabindex="0" aria-label="Open order ${esc(o.order_number)}">
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
      list.onkeydown=e=>{if(['Enter',' '].includes(e.key)&&e.target.matches('.list-card')){e.preventDefault();e.target.click()}};
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

  let audio;
  function orderChime() {
    if (!audio || audio.state !== 'running') return;
    const now = audio.currentTime;
    const tone = audio.createOscillator();
    const volume = audio.createGain();
    tone.frequency.setValueAtTime(660, now);
    tone.frequency.setValueAtTime(880, now + 0.14);
    volume.gain.setValueAtTime(0.14, now);
    volume.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    tone.connect(volume);
    volume.connect(audio.destination);
    tone.start(now);
    tone.stop(now + 0.56);
  }

  let stopOrderAlerts;

  function startRealtime() {
    stopOrderAlerts?.();
    refreshBadge();
    void getShop();
    const alert = $('#order-alert');
    const message = $('#order-alert-message');
    const view = $('#view-new-order');
    const sound = $('#order-sound');
    const pending = new Map();
    const seen = new Set();
    let stopped = false;
    let polling = false;
    const startedAt = Date.now();

    function renderAlert() {
      const order = pending.values().next().value;
      alert.hidden = !order;
      const remaining = pending.size - 1;
      message.textContent = order
        ? `New order #${order.order_number}${remaining ? ` (+${remaining} more)` : ''}`
        : '';
    }

    function refreshOrders() {
      refreshBadge();
      if (currentTab === 'orders' && reloadList) reloadList();
    }

    function notify(order) {
      if (stopped || !order.id || seen.has(order.id)) return;
      seen.add(order.id);
      pending.set(order.id, order);
      renderAlert();
      orderChime();
      refreshOrders();
    }

    // Some projects do not publish orders to Realtime. Check recent arrivals
    // while the admin is visible and deduplicate against both delivery paths.
    async function pollOrders() {
      if (stopped || polling || document.hidden) return;
      polling = true;
      try {
        const { data, error } = await sb.from('orders').select('id,order_number,created_at')
          .order('created_at', { ascending: false }).order('id').limit(50);
        if (error || stopped) return;
        for (const order of [...data].reverse()) {
          if (Date.parse(order.created_at) >= startedAt) notify(order);
        }
      } finally {
        polling = false;
      }
    }

    $('#dismiss-order-alert').onclick = () => {
      pending.delete(pending.keys().next().value);
      renderAlert();
    };
    view.onclick = () => withBusy(view, async () => {
      const id = pending.keys().next().value;
      if (!id) return;
      try {
        const order = throwIfError(await sb.from('orders').select('*, order_items(*)').eq('id', id).single());
        if (stopped) return;
        showTab('orders');
        orderDetail(order, refreshOrders);
        pending.delete(id);
        renderAlert();
      } catch (err) {
        if (!stopped) toast(errMsg(err), 'error');
      }
    });

    sound.setAttribute('aria-checked', String(audio?.state === 'running'));
    sound.onclick = async () => {
      sound.disabled = true;
      try {
        if (audio?.state === 'running') await audio.suspend();
        else {
          audio ||= new (window.AudioContext || window.webkitAudioContext)();
          await audio.resume();
          orderChime();
        }
      } catch { toast('Sound could not be enabled on this device', 'error'); }
      sound.setAttribute('aria-checked', String(audio?.state === 'running'));
      sound.disabled = false;
    };
    const channel = sb.channel('admin-orders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, payload => notify(payload.new))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, refreshOrders)
      .subscribe();
    const timer = setInterval(pollOrders, 30000);
    document.addEventListener('visibilitychange', pollOrders);
    void pollOrders();

    stopOrderAlerts = () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', pollOrders);
      alert.hidden = true;
      pending.clear();
      void sb.removeChannel(channel);
    };
  }

  sb.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT') stopOrderAlerts?.();
  });
  (window.onAdminReady = window.onAdminReady || []).push(startRealtime);
})();
