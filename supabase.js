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
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
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
    await sb.auth.signOut();
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
    if (data?.currency) _currency = data.currency;
    return data;
  },

  async categories() {
    return throwIfError(await sb.from('categories').select('id,name').order('sort_order').order('name'));
  },

  async products({ search = '', categoryId = '', limit = 60, offset = 0 } = {}) {
    let q = sb.from('public_products')
      .select('id,name,description,images,selling_price,category_id,category_name,stock_status')
      .order('name')
      .range(offset, offset + limit - 1);
    const term = search.trim().replace(/[%,()]/g, ' ');
    if (term) q = q.or(`name.ilike.%${term}%,description.ilike.%${term}%`);
    if (categoryId) q = q.eq('category_id', categoryId);
    return throwIfError(await q);
  },

  async product(id) {
    return throwIfError(
      await sb.from('public_products')
        .select('id,name,description,images,selling_price,category_id,category_name,stock_status')
        .eq('id', id).maybeSingle()
    );
  },

  /* Cart lives in the browser only until the order is placed.
     It stores product ids + quantities, never trusted prices. */
  cart: {
    KEY: 'cart_v1',
    get() {
      try { return JSON.parse(localStorage.getItem(this.KEY)) || []; } catch { return []; }
    },
    save(items) {
      try { localStorage.setItem(this.KEY, JSON.stringify(items)); } catch { /* storage unavailable */ }
      window.dispatchEvent(new Event('cart-changed'));
    },
    add(productId, qty = 1) {
      const items = this.get();
      const line = items.find(i => i.product_id === productId);
      if (line) line.quantity = Math.min(999, line.quantity + qty);
      else items.push({ product_id: productId, quantity: Math.min(999, qty) });
      this.save(items);
    },
    setQty(productId, qty) {
      let items = this.get();
      if (qty <= 0) items = items.filter(i => i.product_id !== productId);
      else items.forEach(i => { if (i.product_id === productId) i.quantity = Math.min(999, qty); });
      this.save(items);
    },
    remove(productId) { this.setQty(productId, 0); },
    clear() { this.save([]); },
    count() { return this.get().reduce((n, i) => n + i.quantity, 0); }
  },

  // Fetch current product details for the cart lines (names/prices shown are display only;
  // the server recalculates everything when the order is placed).
  async cartDetails() {
    const items = Shop.cart.get();
    if (!items.length) return [];
    const ids = items.map(i => i.product_id);
    const rows = throwIfError(
      await sb.from('public_products').select('id,name,images,selling_price,category_name,stock_status').in('id', ids)
    );
    const byId = Object.fromEntries(rows.map(r => [r.id, r]));
    return items
      .filter(i => byId[i.product_id])           // drop products that are no longer published
      .map(i => ({ ...i, product: byId[i.product_id] }));
  },

  // The idempotency key makes a double-tap or retry return the SAME order instead of a second one.
  _checkoutKey() {
    let key = sessionStorage.getItem('checkout_key');
    if (!key) {
      key = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
      sessionStorage.setItem('checkout_key', key);
    }
    return key;
  },

  /* Orders this device placed (number + phone), so the customer can follow them without an account. */
  myOrders: {
    KEY: 'my_orders_v1',
    get() { try { return JSON.parse(localStorage.getItem(this.KEY)) || []; } catch { return []; } },
    save(list) { try { localStorage.setItem(this.KEY, JSON.stringify(list.slice(0, 20))); } catch { /* storage unavailable */ } },
    add(n, p) { this.save([{ n: String(n), p }, ...this.get().filter(x => String(x.n) !== String(n))]); },
    remove(n) { this.save(this.get().filter(x => String(x.n) !== String(n))); }
  },

  // Looks up orders by order number + phone (server function, no login needed).
  async trackOrders(lookups) {
    if (!lookups.length) return [];
    return throwIfError(await sb.rpc('track_orders', { p_lookups: lookups })) || [];
  },

  async placeOrder({ name, phone, address }) {
    const items = Shop.cart.get();
    if (!items.length) throw new Error('Your cart is empty');
    const { data, error } = await sb.rpc('place_order', {
      p_customer_name: name,
      p_customer_phone: phone,
      p_delivery_address: address || null,
      p_items: items,
      p_idempotency_key: Shop._checkoutKey()
    });
    if (error) throw new Error(friendlyOrderError(error));
    sessionStorage.removeItem('checkout_key');
    Shop.cart.clear();
    // Remember the confirmation so orders.html can show it after redirect.
    try { sessionStorage.setItem('last_order', JSON.stringify(data)); } catch { /* ignore */ }
    if (data?.order_number) Shop.myOrders.add(data.order_number, phone);
    return data;   // { order_id, order_number, total, duplicate }
  }
};

function friendlyOrderError(error) {
  const m = errMsg(error);
  if (/orders_customer_phone_check/.test(m)) return 'Please enter a valid phone number';
  if (/orders_customer_name_check/.test(m)) return 'Please enter your name (2 to 100 characters)';
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
    let q = sb.from('products').select('*, categories(name)').order('updated_at', { ascending: false });
    const term = search.trim().replace(/[%,()]/g, ' ');
    if (term) q = q.or(`name.ilike.%${term}%,sku.ilike.%${term}%,brand.ilike.%${term}%`);
    if (categoryId) q = q.eq('category_id', categoryId);
    if (status) q = q.eq('status', status);
    let rows = throwIfError(await q);
    if (stock === 'low') rows = rows.filter(p => p.quantity > 0 && p.quantity <= p.min_stock_alert);
    if (stock === 'out') rows = rows.filter(p => p.quantity === 0);
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
      purchase_price: Number(p.purchase_price) || 0,
      selling_price: Number(p.selling_price) || 0,
      min_stock_alert: parseInt(p.min_stock_alert, 10) || 0,
      status: p.status || 'draft'
    };
    if (row.purchase_price < 0 || row.selling_price < 0) throw new Error('Prices cannot be negative');
    return p.id
      ? throwIfError(await sb.from('products').update(row).eq('id', p.id).select().single())
      : throwIfError(await sb.from('products').insert(row).select().single());
  },

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
      .order('created_at', { ascending: false })
      .limit(limit);
    if (productId) q = q.eq('product_id', productId);
    return throwIfError(await q);
  },

  /* Orders */
  async orders({ status = '', from = '', to = '', limit = 200 } = {}) {
    let q = sb.from('orders').select('*, order_items(*)').order('created_at', { ascending: false }).limit(limit);
    if (status) q = q.eq('status', status);
    if (from) q = q.gte('created_at', from);
    if (to) q = q.lte('created_at', to);
    return throwIfError(await q);
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
    if (/^[=+\-@]/.test(s)) s = "'" + s;                  // block spreadsheet formula injection
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
  const [head, ...body] = rows;
  return body.map(r => Object.fromEntries(head.map((h, i) => [h.trim().toLowerCase(), (r[i] ?? '').trim()])));
}
