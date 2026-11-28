/* =====================================================================
   supabase.js - Supabase client + API helpers (shared by every page)

   Load order in each HTML page:
     <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.1"></script>
     <script src="supabase.js"></script>
     <script src="app.js"></script>

   SECURITY: only the PUBLIC anon key goes here. It is safe in frontend code
   because Row Level Security protects the data. NEVER put the service_role
   key in this file.
   ===================================================================== */

const SUPABASE_URL = 'https://gcmudhejegesvwdpkkdy.supabase.co';   // Project URL
const SUPABASE_ANON_KEY = 'sb_publishable_aY7TUgrMK6vyj9tEusVa1Q_M2rxaDfu';              // Publishable key (safe to be public)

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

/* ---------- Small utilities ---------- */

// Escape text before putting it into innerHTML (prevents XSS).
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

let _currency = 'AED';
function money(n) {
  return `${_currency} ${Number(n || 0).toFixed(2)}`;
}

// Turn Supabase errors into a readable message.
function errMsg(error) {
  if (!error) return 'Something went wrong';
  return error.message || String(error);
}

function throwIfError({ data, error }) {
  if (error) throw new Error(errMsg(error));
  return data;
}

/* ---------- Auth ---------- */

const Auth = {
  async signIn(email, password) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error('Invalid email or password');
    if (!(await Auth.isAdmin())) {
      await sb.auth.signOut();
      throw new Error('This account is not authorized for the admin dashboard');
    }
    return data;
  },

  async signOut() {
    throwIfError(await sb.auth.signOut());
  },

  async getSession() {
    const { data } = await sb.auth.getSession();
    return data.session;
  },

  // Server-checked: reads the caller's own profile row (RLS-protected).
  async isAdmin() {
    const session = await Auth.getSession();
    if (!session) return false;
    const { data, error } = await sb.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
    return !error && data?.role === 'admin';
  },

  // Call at the top of admin.html. Redirects to the login view if not admin.
  async requireAdmin() {
    return await Auth.isAdmin();
  }
};

/* ---------- Public (customer) API ---------- */

const Shop = {
  async settings() {
    const data = throwIfError(await sb.from('business_settings').select('*').eq('id', 1).maybeSingle());
    if (data?.currency && /^[A-Z]{3}$/.test(data.currency)) _currency = data.currency;
    return data;
  },

  async categories() {
    return throwIfError(await sb.from('categories').select('id,name').order('sort_order').order('name'));
  },

  // sort: 'name' (default) | 'price_asc' | 'price_desc'.  ids: only these products (used by "Saved").
  async products({ search = '', categoryId = '', limit = 60, offset = 0, sort = 'name', ids = null, minPrice = '', maxPrice = '', inStock = false, brand = '', variantGroup = '' } = {}) {
    if (ids && !ids.length) return [];
    let q = sb.from('public_products')
      .select('id,name,description,images,selling_price,category_id,category_name,stock_status,brand,sku,compare_at_price,variant_group,attributes');
    if (sort === 'price_asc') q = q.order('selling_price', { ascending: true }).order('name');
    else if (sort === 'price_desc') q = q.order('selling_price', { ascending: false }).order('name');
    else q = q.order('name');
    q = q.order('id').range(offset, offset + limit - 1);
    if (ids) q = q.in('id', ids);
    const term = search.trim().slice(0,80).replace(/[^\p{L}\p{N}\s-]/gu, ' ');
    if (term) q = q.or(`name.ilike.%${term}%,description.ilike.%${term}%,brand.ilike.%${term}%,sku.ilike.%${term}%`);
    if (categoryId) q = q.eq('category_id', categoryId);
    if (minPrice !== '' && Number.isFinite(Number(minPrice))) q = q.gte('selling_price', Number(minPrice));
    if (maxPrice !== '' && Number.isFinite(Number(maxPrice))) q = q.lte('selling_price', Number(maxPrice));
    if (brand) q = q.eq('brand', brand);
    if (inStock) q = q.neq('stock_status', 'out_of_stock');
    if (variantGroup) q = q.eq('variant_group', variantGroup);
    return throwIfError(await q);
  },

  async categoryPreviews() {
    return throwIfError(await sb.rpc('category_previews'));
  },

  async product(id) {
    return throwIfError(
      await sb.from('public_products')
        .select('id,name,description,images,selling_price,category_id,category_name,stock_status,brand,sku,compare_at_price,variant_group,attributes')
        .eq('id', id).maybeSingle()
    );
  },

  /* Cart lives in the browser only until the order is placed.
     It stores product ids + quantities, never trusted prices. */
  cart: {
    KEY: 'cart_v1',
    MAX_QUANTITY: 10,
    get() {
      try { const rows = JSON.parse(localStorage.getItem(this.KEY)); return Array.isArray(rows) ? rows.filter(i => i && typeof i.product_id === 'string' && Number.isInteger(i.quantity) && i.quantity > 0 && i.quantity <= 999).slice(0,50).map(line=>({...line,quantity:Math.min(this.MAX_QUANTITY,line.quantity)})) : []; } catch { return []; }
    },
    save(items) {
      try { localStorage.setItem(this.KEY, JSON.stringify(items)); } catch { /* storage unavailable */ }
      window.dispatchEvent(new Event('cart-changed'));
    },
    add(productId, qty = 1) {
      if (!Number.isInteger(qty) || qty < 1 || qty > 999) throw new Error('Invalid quantity');
      const items = this.get();
      const line = items.find(i => i.product_id === productId);
      if (!line && items.length>=50) throw new Error('Maximum 50 different products per order');
      if (line) line.quantity = Math.min(this.MAX_QUANTITY, line.quantity + qty);
      else items.push({ product_id: productId, quantity: Math.min(this.MAX_QUANTITY, qty) });
      this.save(items);
    },
    setQty(productId, qty) {
      if (!Number.isInteger(qty)) throw new Error('Invalid quantity');
      let items = this.get();
      if (qty <= 0) items = items.filter(i => i.product_id !== productId);
      else items.forEach(i => { if (i.product_id === productId) i.quantity = Math.min(this.MAX_QUANTITY, qty); });
      this.save(items);
    },
    remove(productId) { this.setQty(productId, 0); },
    clear() { this.save([]); },
    count() { return this.get().reduce((n, i) => n + i.quantity, 0); }
  },

  /* Saved (favourite) products live in the browser only. */
  favs: {
    KEY: 'favs_v1',
    get() { try { const a=JSON.parse(localStorage.getItem(this.KEY));return Array.isArray(a)?a.filter(x=>typeof x==='string').slice(0,100):[]; } catch { return []; } },
    has(id) { return this.get().includes(id); },
    toggle(id) {
      const list = this.get();
      const next = list.includes(id) ? list.filter(x => x !== id) : [id, ...list].slice(0, 100);
      try { localStorage.setItem(this.KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
      window.dispatchEvent(new Event('favs-changed'));
      return next.includes(id);
    }
  },

  // Fetch current product details for the cart lines (names/prices shown are display only;
  // the server recalculates everything when the order is placed).
  async cartDetails() {
    const items = Shop.cart.get();
    if (!items.length) return [];
    const ids = items.map(i => i.product_id);
    const rows = throwIfError(
      await sb.from('public_products').select('id,name,images,selling_price,category_name,stock_status,brand,sku,compare_at_price,variant_group,attributes').in('id', ids)
    );
    const byId = Object.fromEntries(rows.map(r => [r.id, r]));
    return items
      .filter(i => byId[i.product_id])           // drop products that are no longer published
      .map(i => ({ ...i, product: byId[i.product_id] }));
  },

  // The idempotency key makes a double-tap or retry return the SAME order instead of a second one.
  _checkoutKey(fingerprint) {
    let key = sessionStorage.getItem('checkout_key');
    const previous = sessionStorage.getItem('checkout_fingerprint');
    if (key && previous && previous !== fingerprint) {
      if (sessionStorage.getItem('checkout_rejected') !== '1') {
        throw new Error('Your previous checkout may still have succeeded. Check My Orders, then restore the original cart and coupon to retry safely.');
      }
      key = null;
    }
    if (!key) {
      key = crypto.randomUUID();
      sessionStorage.setItem('checkout_key',key);
    }
    sessionStorage.setItem('checkout_fingerprint',fingerprint);
    sessionStorage.removeItem('checkout_rejected');
    return key;
  },

  /* Orders this device placed (number + phone), so the customer can follow them without an account. */
  myOrders: {
    KEY: 'my_orders_v1',
    get() { try { const a=JSON.parse(localStorage.getItem(this.KEY));return Array.isArray(a)?a.filter(x=>x&&typeof x.n==='string'&&typeof x.p==='string').slice(0,20):[]; } catch { return []; } },
    save(list) { try { localStorage.setItem(this.KEY, JSON.stringify(list.slice(0, 20))); } catch { /* storage unavailable */ } },
    // extra = { t: total, d: date } kept locally so the order still shows even if live tracking is unreachable
    add(n, p, extra) { this.save([{ n: String(n), p, ...(extra || {}) }, ...this.get().filter(x => String(x.n) !== String(n))]); },
    remove(n) { this.save(this.get().filter(x => String(x.n) !== String(n))); }
  },

  // Looks up orders by order number + phone (server function, no login needed).
  async brands() {
    const query = sb.from('public_products').select('brand').not('brand', 'is', null).order('brand').order('id');
    const rows = await pagedRows((start,end) => query.range(start,end));
    return [...new Set(rows.map(row => row.brand).filter(brand => brand?.trim()))];
  },

  async deliveredOrderItems(orderNumber) {
    const session = await Auth.getSession();
    if (!session || session.user.is_anonymous) throw new Error('Sign in to buy these items again.');
    const order = throwIfError(await sb.from('orders').select('order_items(product_id,quantity)')
      .eq('customer_id',session.user.id).eq('order_number',orderNumber).eq('status','completed').maybeSingle());
    if (!order) throw new Error('This delivered order is not available in your account.');
    return order.order_items || [];
  },

  async trackOrders(lookups) {
    if (!lookups.length) return [];
    const { data, error } = await sb.rpc('track_orders', { p_lookups: lookups.map(l => ({ n: l.n, p: l.p })) });
    if (error) { console.error('track_orders failed', error); throw new Error(errMsg(error)); }
    let rows = data;
    if (typeof rows === 'string') { try { rows = JSON.parse(rows); } catch { rows = []; } }
    return Array.isArray(rows) ? rows : (rows ? [rows] : []);
  },

  async quote(coupon = '', items = Shop.cart.get()) { return throwIfError(await sb.rpc('quote_order', { p_items: items, p_coupon: coupon || null })); },

  async placeOrder({ name, phone, address, coupon = '' }) {
    const items = Shop.cart.get();
    if (!items.length) throw new Error('Your cart is empty');
    const session = await Auth.getSession();
    if (!session || session.user.is_anonymous) {
      throw Object.assign(new Error('Sign in to place your order.'), { code: 'CHECKOUT_SIGN_IN' });
    }
    const normalizedCoupon = coupon.trim().toUpperCase();
    const fingerprint = JSON.stringify([session.user.id,normalizedCoupon,
      items.map(({product_id,quantity})=>[product_id,quantity]).sort(([a],[b])=>a.localeCompare(b))]);
    const key = Shop._checkoutKey(fingerprint);
    const { data, error } = await sb.rpc('checkout_v8', {
      p_customer_name: name,
      p_customer_phone: phone,
      p_delivery_address: address || null,
      p_items: items,
      p_idempotency_key: key,
      p_coupon: normalizedCoupon || null
    });
    if (error) {
      // Only known checkout validation failures prove the transaction rolled back.
      if (error.code === 'P0001' && /^(Coupon|Not enough stock|Invalid |A product is no longer available)/i.test(error.message)) {
        sessionStorage.setItem('checkout_rejected','1');
      }
      throw new Error(friendlyOrderError(error));
    }

    // The server may return an object, a one-row array or a JSON string; accept all.
    let result = data;
    if (typeof result === 'string') { try { result = JSON.parse(result); } catch { result = null; } }
    if (Array.isArray(result)) result = result[0];
    result = result || {};
    const num = result.order_number ?? result.number ?? result.order_no;
    if (num == null) throw new Error('Order confirmation unavailable. Retry with the same cart.');
    result.order_number = num;
    for (const field of ['checkout_key','checkout_fingerprint','checkout_rejected']) sessionStorage.removeItem(field);
    Shop.cart.clear();
    // Remember the confirmation so orders.html can show it after redirect.
    try { sessionStorage.setItem('last_order', JSON.stringify(result)); } catch { /* ignore */ }
    if (num != null) Shop.myOrders.add(num, phone, { t: result.total, d: new Date().toISOString() });
    return result;   // { order_id, order_number, total, duplicate }
  }
};

function friendlyOrderError(error) {
  const m = errMsg(error);
  if (/orders_customer_phone_check/.test(m)) return 'Please enter a valid phone number';
  if (/orders_customer_name_check/.test(m)) return 'Please enter your name (2 to 100 characters)';
  if (/Coupon|Idempotency|Too many|Invalid phone|Invalid customer|Invalid delivery/.test(m)) return m;
  if (/Not enough stock|no longer available|empty or invalid|Invalid quantity/.test(m)) return m.replace(/^.*?(Not enough|A product|Cart|Invalid)/, '$1');
  return 'Could not place the order. Please try again.';
}

/* ---------- Admin API (every call is enforced by RLS / admin checks in SQL) ---------- */

const Admin = {
  /* Dashboard */
  async summary() {
    return throwIfError(await sb.rpc('admin_dashboard_summary'));
  },

  /* Categories */
  async categories() {
    return throwIfError(await sb.from('categories').select('*').order('sort_order').order('name'));
  },
  async saveCategory({ id, name, sort_order = 0 }) {
    const row = { name: name.trim(), sort_order };
    return id
      ? throwIfError(await sb.from('categories').update(row).eq('id', id).select().single())
      : throwIfError(await sb.from('categories').insert(row).select().single());
  },
  async deleteCategory(id) {
    throwIfError(await sb.from('categories').delete().eq('id', id));
  },

  /* Products */
  async products({ search = '', categoryId = '', status = '', stock = '' } = {}) {
    let q = sb.from('products').select('*, categories(name)').order('updated_at', { ascending: false }).order('id');
    const term = search.trim().slice(0,80).replace(/[^\p{L}\p{N}\s-]/gu, ' ');
    if (term) q = q.or(`name.ilike.%${term}%,sku.ilike.%${term}%,brand.ilike.%${term}%`);
    if (categoryId) q = q.eq('category_id', categoryId);
    if (status) q = q.eq('status', status);
    let rows = await pagedRows((start,end)=>q.range(start,end));
    if (stock === 'low') rows = rows.filter(p => p.quantity-p.reserved_quantity > 0 && p.quantity-p.reserved_quantity <= p.min_stock_alert);
    if (stock === 'out') rows = rows.filter(p => p.quantity-p.reserved_quantity <= 0);
    return rows;
  },

  // Quantity is NOT saved here. Use stockMove() so every change is logged.
  async saveProduct(p) {
    const row = {
      sku: p.sku?.trim() || null,
      name: p.name.trim(),
      category_id: p.category_id || null,
      brand: p.brand?.trim() || null,
      description: p.description?.trim() || null,
      images: p.images || [],
      purchase_price: Number(p.purchase_price ?? 0),
      selling_price: Number(p.selling_price ?? 0),
      min_stock_alert: Number(p.min_stock_alert ?? 0),
      status: p.status || 'draft',
      compare_at_price: p.compare_at_price === '' || p.compare_at_price == null ? null : Number(p.compare_at_price),
      variant_group: p.variant_group?.trim() || null,
      attributes: p.attributes || {}
    };
    if (!Number.isInteger(row.min_stock_alert) || row.min_stock_alert < 0) throw new Error('Minimum stock must be a whole number');
    if (![row.purchase_price,row.selling_price].every(Number.isFinite) || row.purchase_price < 0 || row.selling_price < 0) throw new Error('Prices cannot be negative');
    const saved = p.id
      ? throwIfError(await sb.from('products').update(row).eq('id', p.id).select().single())
      : throwIfError(await sb.rpc('admin_create_product', {p_product:row,p_initial_quantity:Number(p.initial_quantity||0)}));
    return Array.isArray(saved)?saved[0]:saved;
  },

  async archiveProduct(id) { throwIfError(await sb.from('products').update({status:'archived'}).eq('id',id)); },

  async deleteProduct(id) {
    const { error } = await sb.from('products').delete().eq('id', id);
    if (error) {
      if (/inventory_movements|foreign key/i.test(error.message)) {
        throw new Error('This product has stock history and cannot be deleted. Set its status to Archived instead.');
      }
      throw new Error(errMsg(error));
    }
  },

  /* Stock */
  async stockMove(productId, type, quantity, reason) {
    throwIfError(await sb.rpc('admin_stock_move', {
      p_product_id: productId, p_type: type, p_quantity: quantity, p_reason: reason || null
    }));
  },

  async movements({ productId = '', limit = 200 } = {}) {
    let q = sb.from('inventory_movements')
      .select('*, products(name,sku)')
      .order('created_at', { ascending: false }).order('id');
    if (productId) q = q.eq('product_id', productId);
    return pagedRows((start,end)=>q.range(start,end),limit);
  },

  /* Orders */
  async orders({ status = '', from = '', to = '', limit = 200 } = {}) {
    let q = sb.from('orders').select('*, order_items(*)').order('created_at', { ascending: false }).order('id');
    if (status) q = q.eq('status', status);
    if (from) q = q.gte('created_at', from);
    if (to) q = q.lte('created_at', to);
    return pagedRows((start,end)=>q.range(start,end),limit);
  },

  // step: 'packed' | 'out_for_delivery' | null (back to just "accepted")
  async setFulfillment(orderId, step) {
    throwIfError(await sb.rpc('admin_set_fulfillment', { p_order_id: String(orderId), p_step: step || null }));
  },

  async setOrderStatus(orderId, status) {
    throwIfError(await sb.rpc('set_order_status', { p_order_id: orderId, p_status: status }));
  },

  /* Settings */
  async saveSettings({ business_name, currency, contact_phone, public_url }) {
    throwIfError(await sb.from('business_settings').update({
      business_name, currency, contact_phone: contact_phone || null, public_url: public_url || null
    }).eq('id', 1));
  },

  /* Images (Supabase Storage, bucket: product-images) */
  async uploadImage(file) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) throw new Error('Only JPG, PNG or WebP images are allowed');
    if (file.size > 15 * 1024 * 1024) throw new Error('Image is too large (max 15 MB before optimization)');

    const optimized = await optimizeImage(file);               // resize + convert to WebP when supported
    const ext = optimized.type === 'image/webp' ? 'webp' : (optimized.type === 'image/png' ? 'png' : 'jpg');
    const path = `${(crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(16).slice(2))}.${ext}`;

    throwIfError(await sb.storage.from('product-images').upload(path, optimized, {
      contentType: optimized.type, cacheControl: '31536000', upsert: false
    }));
    return sb.storage.from('product-images').getPublicUrl(path).data.publicUrl;
  },

  async deleteImage(publicUrl) {
    const marker = '/product-images/';
    const i = publicUrl.indexOf(marker);
    if (i === -1) return;
    const path = decodeURIComponent(publicUrl.slice(i + marker.length));
    throwIfError(await sb.storage.from('product-images').remove([path]));
  },

  /* Push notification token (admin device) */
  async saveNotificationToken(token, platform = 'web') {
    const session = await Auth.getSession();
    if (!session) throw new Error('Not signed in');
    throwIfError(await sb.from('notification_tokens').upsert(
      { user_id: session.user.id, token, platform }, { onConflict: 'token' }
    ));
  }
};

/* Resize large photos (phones take 4000px+ images) and convert to WebP. */
async function optimizeImage(file, maxSide = 1280, quality = 0.82) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise(res => canvas.toBlob(res, 'image/webp', quality));
    // Some browsers silently fall back to PNG when WebP is unsupported; keep the smaller file.
    if (blob && blob.size < file.size) return blob;
    return file;
  } catch {
    return file;   // fall back to the original file
  }
}

/* ---------- CSV helpers (used for reports and import) ---------- */

function toCSV(rows, columns) {
  const cols = columns || Object.keys(rows[0] || {});
  const cell = v => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[\s]*[=+\-@]|^[\t\r\n]/.test(s)) s = "'" + s;                  // block spreadsheet formula injection
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '\uFEFF' + [cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\r\n');
}

function downloadFile(filename, content, mime = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function parseCSV(text) {
  const rows = []; let row = [], cell = '', inQ = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') inQ = false;
      else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(x => x !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some(x => x !== '')) rows.push(row);
  if (inQ) throw new Error('Unclosed CSV quote');
  if (!rows.length) return [];
  const [head, ...body] = rows;
  if (new Set(head.map(h => h.trim().toLowerCase())).size !== head.length) throw new Error('Duplicate CSV headers');
  if (body.some(r => r.length !== head.length)) throw new Error('CSV row has the wrong number of columns');
  return body.map(r => Object.fromEntries(head.map((h, i) => [h.trim().toLowerCase(), (r[i] ?? '').trim()])));
}

const deliveryFields = [
  ['address', 'Street, building and flat', 'street-address', 145, 'text'],
  ['area', 'Area / neighbourhood', 'address-level3', 55, 'text'],
  ['emirate', 'Emirate / city', 'address-level1', 35, 'text'],
  ['maps', 'Google Maps link', 'off', 300, 'url'],
  ['instructions', 'Delivery instructions', 'off', 100, 'text']
];

function deliveryInputs(details = {}) {
  return deliveryFields.map(([key, label, autocomplete, max, type]) =>
    `<label class="field"><span>${label} (optional)</span><input class="in" name="${key}" type="${type}" autocomplete="${autocomplete}" maxlength="${max}" value="${esc(details?.[key] || '')}"${key === 'maps' ? ' placeholder="Paste a link from Google Maps → Share"' : ''}></label>`
  ).join('');
}

function readDelivery(fields) {
  return Object.fromEntries(deliveryFields.map(([key]) => [key, fields[key].value.trim()]));
}

function deliveryAddress(details) {
  const { address, area, emirate, maps, instructions } = details;
  if (maps) {
    let url;
    try { url = new URL(maps); } catch {}
    const isGoogleMaps = url && (
      (['www.google.com', 'google.com'].includes(url.hostname) && /^\/maps(?:\/|$)/.test(url.pathname)) ||
      url.hostname === 'maps.google.com' || url.hostname === 'maps.app.goo.gl' ||
      (url.hostname === 'goo.gl' && url.pathname.startsWith('/maps/'))
    );
    if (!isGoogleMaps || url.protocol !== 'https:' || url.username || url.password) {
      throw new Error('Paste an HTTPS share link from Google Maps.');
    }
  }
  const parts = [address, area, emirate, instructions && 'Instructions: ' + instructions, maps && 'Google Maps: ' + maps];
  const result = parts.filter(Boolean).join(' | ');
  if (Array.from(result).length > 500) throw new Error('Shorten the delivery details or use the short link from Google Maps.');
  return result;
}

// Customer calls use the caller's session and RLS; never grant roles from user metadata.
const Customer = {
  async signIn(email,password) { return throwIfError(await sb.auth.signInWithPassword({email,password})); },
  async signUp(email,password,name) { return throwIfError(await sb.auth.signUp({email,password,options:{data:{full_name:name},emailRedirectTo:new URL('account.html',location.href).href}})); },
  async profile() { const {data:{user}} = await sb.auth.getUser(); return user ? throwIfError(await sb.from('profiles').select('id,full_name').eq('id',user.id).single()) : null; },
  async saveDelivery(delivery) {
    deliveryAddress(delivery);
    throwIfError(await sb.auth.updateUser({ data: { delivery } }));
  },
  async saveName(id,full_name) { throwIfError(await sb.from('profiles').update({full_name}).eq('id',id)); },
  async orders(id) { return throwIfError(await sb.from('orders').select('id,order_number,status,total,created_at,fulfillment_step,order_items(product_name,quantity,unit_price)').eq('customer_id',id).order('created_at',{ascending:false}).limit(100)); }
};
function validateImportRows(rows) {
  const seen = new Set();
  for (const [i,r] of rows.entries()) {
    const fail = msg => { throw new Error(`Row ${i+2}: ${msg}`); };
    if (!r.name?.trim() || r.name.length>160) fail('Invalid product name');
    for (const k of ['purchase_price','selling_price','quantity','min_stock_alert']) {
      if (r[k] && (!Number.isFinite(Number(r[k])) || Number(r[k])<0 || (['quantity','min_stock_alert'].includes(k) && !Number.isInteger(Number(r[k]))))) fail(`Invalid ${k}`);
    }
    if (r.status && !['draft','published','archived'].includes(r.status)) fail('Invalid status');
    if (r.sku && seen.has(r.sku.toLowerCase())) fail('Duplicate SKU in file');
    if(r.sku) seen.add(r.sku.toLowerCase());
  }
  return rows;
}

async function pagedRows(query,limit=10000) {
  const result=[];
  for(let start=0;start<limit;start+=500){
    const end=Math.min(start+499,limit-1),batch=throwIfError(await query(start,end));
    result.push(...batch);if(batch.length<end-start+1)break;
  }
  return result;
}
