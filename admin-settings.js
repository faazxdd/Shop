/* =====================================================================
   admin-settings.js - Settings tab (admin part 4)
   Categories, business settings, QR code (PNG/SVG), product CSV import.
   ===================================================================== */

(function () {
  /* ---------- QR library (loaded only when needed; pinned version) ---------- */
  const QR_URLS = [
    'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js',
    'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js'
  ];
  let qrLoading = null;
  function loadQR() {
    if (window.qrcode) return Promise.resolve();
    if (qrLoading) return qrLoading;
    qrLoading = (async () => {
      for (const src of QR_URLS) {
        try {
          await new Promise((ok, fail) => {
            const s = document.createElement('script');
            s.src = src; s.onload = ok; s.onerror = fail;
            document.head.appendChild(s);
          });
          if (window.qrcode) return;
        } catch { /* try next */ }
      }
      qrLoading = null;
      throw new Error('Could not load the QR code library. Check your connection.');
    })();
    return qrLoading;
  }

  function makeQR(text) {
    const qr = window.qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    return qr;
  }

  function qrSvg(text) {
    const qr = makeQR(text), n = qr.getModuleCount(), m = 4, size = n + m * 2;
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + m},${r + m}h1v1h-1z`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  }

  function qrPngBlob(text) {
    const qr = makeQR(text), n = qr.getModuleCount(), m = 4;
    const cell = Math.max(4, Math.floor(1024 / (n + m * 2)));
    const size = (n + m * 2) * cell;
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#000';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) ctx.fillRect((c + m) * cell, (r + m) * cell, cell, cell);
    return new Promise(res => cv.toBlob(res, 'image/png'));
  }

  function defaultSiteUrl() { return new URL('.', location.href).href; }   // folder this admin page lives in = site root

  /* ---------- Tab ---------- */
  Tabs.push({
    key: 'settings', order: 5, label: 'Settings', ico: '&#9881;',
    async render(el) {
      const settings = (await Shop.settings()) || {};
      el.innerHTML = `
        <div class="card">
          <h2>Business</h2>
          <form id="bs">
            <div class="form-grid">
              <label class="field"><span>Business name</span><input class="input" name="business_name" maxlength="80" value="${esc(settings.business_name)}" required></label>
              <label class="field"><span>Currency</span><input class="input" name="currency" maxlength="8" value="${esc(settings.currency || 'AED')}" required></label>
              <label class="field"><span>Contact phone (shown to customers)</span><input class="input" name="contact_phone" type="tel" maxlength="20" value="${esc(settings.contact_phone)}"></label>
              <label class="field"><span>Public website link</span><input class="input" name="public_url" type="url" maxlength="300" placeholder="${esc(defaultSiteUrl())}" value="${esc(settings.public_url)}">
                <div class="help">The customer site address. Used for the QR code.</div></label>
            </div>
            <button class="btn btn-primary" type="submit" id="bs-save">Save business settings</button>
          </form>
        </div>

        <div class="card mt">
          <h2>Categories</h2>
          <form class="row" id="cat-add"><input class="input" name="name" maxlength="80" placeholder="New category name" required><button class="btn btn-primary" type="submit">Add</button></form>
          <div id="cat-list" class="mt"></div>
        </div>

        <div class="card mt">
          <h2>QR code</h2>
          <p class="muted small">Customers scan this to open your catalogue. It never links to the admin page.</p>
          <div class="qr-box" id="qr"><span class="muted small">Generating...</span></div>
          <p class="center small mt" id="qr-url" style="word-break:break-all"></p>
          <div class="row wrap mt" style="justify-content:center">
            <button class="btn btn-sm" id="qr-png">Download PNG</button>
            <button class="btn btn-sm" id="qr-svg">Download SVG</button>
            <button class="btn btn-sm" id="qr-copy">Copy link</button>
          </div>
        </div>

        <div class="card mt">
          <h2>Import products (CSV)</h2>
          <p class="help">Header row, comma separated. Columns: <code>name</code> (required), sku, category, brand, description, purchase_price, selling_price, min_stock_alert, status (draft/published/archived), quantity.
          A row with an existing SKU updates that product (quantity is only used for new products). Save Excel files as "CSV UTF-8".</p>
          <input type="file" id="csv" accept=".csv,text/csv" class="input">
          <div id="csv-result" class="mt small"></div>
        </div>`;

      /* --- Business settings --- */
      $('#bs').onsubmit = async e => {
        e.preventDefault();
        const f = e.target.elements;
        await withBusy($('#bs-save'), async () => {
          try {
            await Admin.saveSettings({ business_name: f.business_name.value.trim(), currency: f.currency.value.trim().toUpperCase(),
                                       contact_phone: f.contact_phone.value.trim(), public_url: f.public_url.value.trim() });
            Object.assign(settings, { public_url: f.public_url.value.trim() });
            toast('Settings saved', 'success'); drawQR();
          } catch (err) { toast(errMsg(err), 'error'); }
        });
      };

      /* --- Categories --- */
      const catList = $('#cat-list');
      async function loadCats() {
        try {
          const cats = await Admin.categories();
          catList.innerHTML = cats.length ? cats.map(c => `
            <div class="row between" style="padding:8px 0;border-bottom:1px solid var(--border)" data-id="${esc(c.id)}" data-name="${esc(c.name)}">
              <span>${esc(c.name)}</span>
              <span class="row"><button class="btn btn-sm" data-edit>Rename</button><button class="btn btn-sm btn-danger" data-del>Delete</button></span>
            </div>`).join('') : '<p class="muted small">No categories yet.</p>';
        } catch (err) { catList.innerHTML = `<p class="error-text">${esc(errMsg(err))}</p>`; }
      }
      $('#cat-add').onsubmit = async e => {
        e.preventDefault();
        const input = e.target.elements.name;
        try { await Admin.saveCategory({ name: input.value }); input.value = ''; loadCats(); }
        catch (err) { toast(/duplicate/i.test(errMsg(err)) ? 'That category already exists' : errMsg(err), 'error'); }
      };
      catList.onclick = async e => {
        const row = e.target.closest('[data-id]'); if (!row) return;
        const id = row.dataset.id, name = row.dataset.name;
        if (e.target.closest('[data-del]')) {
          if (!(await confirmDialog(`Delete category "${name}"? Its products will become uncategorized.`, 'Delete', true))) return;
          try { await Admin.deleteCategory(id); loadCats(); } catch (err) { toast(errMsg(err), 'error'); }
        } else if (e.target.closest('[data-edit]')) {
          const body = openSheet('Rename category', `<form id="rn"><label class="field"><span>Name</span><input class="input" name="name" maxlength="80" value="${esc(name)}" required></label>
            <button class="btn btn-primary btn-block" type="submit">Save</button></form>`);
          $('#rn', body).onsubmit = async ev => {
            ev.preventDefault();
            try { await Admin.saveCategory({ id, name: ev.target.elements.name.value }); closeSheet(); loadCats(); }
            catch (err) { toast(errMsg(err), 'error'); }
          };
        }
      };
      loadCats();

      /* --- QR --- */
      let qrText = '';
      async function drawQR() {
        const box = $('#qr');
        qrText = (settings.public_url || '').trim() || defaultSiteUrl();
        $('#qr-url').textContent = qrText;
        if (/admin/i.test(qrText)) { box.innerHTML = '<span class="error-text">The link must be your customer site, not the admin page.</span>'; qrText = ''; return; }
        try { await loadQR(); box.innerHTML = qrSvg(qrText); }
        catch (err) { box.innerHTML = `<span class="error-text">${esc(errMsg(err))}</span>`; qrText = ''; }
      }
      $('#qr-svg').onclick = () => { if (qrText) downloadFile('shop-qr.svg', qrSvg(qrText), 'image/svg+xml'); };
      $('#qr-png').onclick = async () => { if (qrText) downloadFile('shop-qr.png', await qrPngBlob(qrText), 'image/png'); };
      $('#qr-copy').onclick = async () => {
        if (!qrText) return;
        try { await navigator.clipboard.writeText(qrText); toast('Link copied', 'success'); }
        catch { toast('Could not copy. Select the link and copy it manually.', 'error'); }
      };
      drawQR();

      /* --- CSV import --- */
      $('#csv').onchange = async e => {
        const file = e.target.files[0]; if (!file) return;
        const out = $('#csv-result');
        out.textContent = 'Reading file...';
        try {
          if (file.size > 2 * 1024 * 1024) throw new Error('File is too large (max 2 MB)');
          const rows = parseCSV(await file.text());
          if (!rows.length) throw new Error('No data rows found');
          if (rows.length > 500) throw new Error('Too many rows (max 500 per import)');
          if (!('name' in rows[0])) throw new Error('The file needs a "name" column');
          if (!(await confirmDialog(`Import ${rows.length} row(s)?`, 'Import'))) { out.textContent = ''; return; }

          const cats = await Admin.categories();
          const catId = {}; cats.forEach(c => { catId[c.name.toLowerCase()] = c.id; });
          const existing = await Admin.products();
          const bySku = {}; existing.forEach(p => { if (p.sku) bySku[p.sku.toLowerCase()] = p; });

          let added = 0, updated = 0; const failed = [];
          for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            out.textContent = `Importing ${i + 1} of ${rows.length}...`;
            try {
              if (!r.name) throw new Error('missing name');
              let category_id = '';
              if (r.category) {
                const key = r.category.toLowerCase();
                if (!catId[key]) catId[key] = (await Admin.saveCategory({ name: r.category })).id;
                category_id = catId[key];
              }
              const status = ['draft', 'published', 'archived'].includes((r.status || '').toLowerCase()) ? r.status.toLowerCase() : 'draft';
              const prev = r.sku ? bySku[r.sku.toLowerCase()] : null;
              const saved = await Admin.saveProduct({
                id: prev?.id, sku: r.sku, name: r.name, brand: r.brand, description: r.description, category_id, status,
                purchase_price: r.purchase_price, selling_price: r.selling_price, min_stock_alert: r.min_stock_alert || 5,
                images: prev?.images || []
              });
              if (prev) updated++;
              else {
                added++;
                const q = parseInt(r.quantity, 10) || 0;
                if (q > 0) await Admin.stockMove(saved.id, 'in', q, 'CSV import');
              }
            } catch (err) { failed.push(`Row ${i + 2}: ${errMsg(err)}`); }
          }
          out.innerHTML = `<strong>Done.</strong> ${added} added, ${updated} updated, ${failed.length} failed.` +
            (failed.length ? `<ul>${failed.slice(0, 20).map(f => `<li>${esc(f)}</li>`).join('')}</ul>` : '');
        } catch (err) { out.innerHTML = `<span class="error-text">${esc(errMsg(err))}</span>`; }
        e.target.value = '';
      };
    }
  });
})();
