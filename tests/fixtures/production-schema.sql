-- Schema-only snapshot of public on 2026-11-24. TEST FIXTURE ONLY. No production rows.
create role anon; create role authenticated;
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth, public to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;
create sequence public.order_number_seq start 1000;
create table public.categories (id uuid NOT NULL DEFAULT gen_random_uuid(), name text NOT NULL, sort_order integer NOT NULL DEFAULT 0, created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now());
create table public.business_settings (id integer NOT NULL DEFAULT 1, business_name text NOT NULL DEFAULT 'My Business'::text, currency text NOT NULL DEFAULT 'AED'::text, contact_phone text, public_url text, updated_at timestamp with time zone NOT NULL DEFAULT now());
create table public.products (id uuid NOT NULL DEFAULT gen_random_uuid(), sku text, name text NOT NULL, category_id uuid, brand text, description text, images text[] NOT NULL DEFAULT '{}'::text[], purchase_price numeric(12,2) NOT NULL DEFAULT 0, selling_price numeric(12,2) NOT NULL DEFAULT 0, quantity integer NOT NULL DEFAULT 0, reserved_quantity integer NOT NULL DEFAULT 0, min_stock_alert integer NOT NULL DEFAULT 5, status text NOT NULL DEFAULT 'draft'::text, created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now());
create table public.profiles (id uuid NOT NULL, full_name text, role text NOT NULL DEFAULT 'customer'::text, created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now());
create table public.order_items (id uuid NOT NULL DEFAULT gen_random_uuid(), order_id uuid NOT NULL, product_id uuid, product_name text NOT NULL, unit_price numeric(12,2) NOT NULL, quantity integer NOT NULL, line_total numeric(12,2) NOT NULL, created_at timestamp with time zone NOT NULL DEFAULT now());
create table public.inventory_movements (id uuid NOT NULL DEFAULT gen_random_uuid(), product_id uuid NOT NULL, movement_type text NOT NULL, quantity_change integer NOT NULL DEFAULT 0, reserved_change integer NOT NULL DEFAULT 0, quantity_after integer NOT NULL, reserved_after integer NOT NULL, reason text, order_id uuid, created_by uuid, created_at timestamp with time zone NOT NULL DEFAULT now());
create table public.notification_tokens (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, token text NOT NULL, platform text, created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now());
create table public.order_tracking_attempts (client_key text NOT NULL, window_start timestamp with time zone NOT NULL, attempts integer NOT NULL DEFAULT 0);
create table public.orders (id uuid NOT NULL DEFAULT gen_random_uuid(), order_number bigint NOT NULL DEFAULT nextval('order_number_seq'::regclass), customer_name text NOT NULL, customer_phone text NOT NULL, delivery_address text, status text NOT NULL DEFAULT 'pending'::text, total numeric(12,2) NOT NULL DEFAULT 0, idempotency_key text NOT NULL, created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now(), fulfillment_step text, request_hash text);
ALTER TABLE profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE categories ADD CONSTRAINT categories_name_check CHECK (((length(name) >= 1) AND (length(name) <= 80)));
ALTER TABLE categories ADD CONSTRAINT categories_pkey PRIMARY KEY (id);
ALTER TABLE categories ADD CONSTRAINT categories_name_key UNIQUE (name);
ALTER TABLE products ADD CONSTRAINT products_sku_check CHECK (((sku IS NULL) OR (length(sku) <= 64)));
ALTER TABLE products ADD CONSTRAINT products_name_check CHECK (((length(name) >= 1) AND (length(name) <= 160)));
ALTER TABLE products ADD CONSTRAINT products_brand_check CHECK (((brand IS NULL) OR (length(brand) <= 80)));
ALTER TABLE products ADD CONSTRAINT products_description_check CHECK (((description IS NULL) OR (length(description) <= 4000)));
ALTER TABLE products ADD CONSTRAINT products_purchase_price_check CHECK ((purchase_price >= (0)::numeric));
ALTER TABLE products ADD CONSTRAINT products_selling_price_check CHECK ((selling_price >= (0)::numeric));
ALTER TABLE products ADD CONSTRAINT products_quantity_check CHECK ((quantity >= 0));
ALTER TABLE products ADD CONSTRAINT products_reserved_quantity_check CHECK ((reserved_quantity >= 0));
ALTER TABLE products ADD CONSTRAINT products_min_stock_alert_check CHECK ((min_stock_alert >= 0));
ALTER TABLE products ADD CONSTRAINT products_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])));
ALTER TABLE products ADD CONSTRAINT products_check CHECK ((reserved_quantity <= quantity));
ALTER TABLE products ADD CONSTRAINT products_pkey PRIMARY KEY (id);
ALTER TABLE products ADD CONSTRAINT products_sku_key UNIQUE (sku);
ALTER TABLE orders ADD CONSTRAINT orders_customer_name_check CHECK (((length(customer_name) >= 2) AND (length(customer_name) <= 100)));
ALTER TABLE orders ADD CONSTRAINT orders_customer_phone_check CHECK ((customer_phone ~ '^[+0-9][0-9 ()-]{6,19}$'::text));
ALTER TABLE orders ADD CONSTRAINT orders_delivery_address_check CHECK (((delivery_address IS NULL) OR (length(delivery_address) <= 300)));
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'processing'::text, 'completed'::text, 'rejected'::text, 'cancelled'::text])));
ALTER TABLE orders ADD CONSTRAINT orders_total_check CHECK ((total >= (0)::numeric));
ALTER TABLE orders ADD CONSTRAINT orders_pkey PRIMARY KEY (id);
ALTER TABLE orders ADD CONSTRAINT orders_order_number_key UNIQUE (order_number);
ALTER TABLE orders ADD CONSTRAINT orders_idempotency_key_key UNIQUE (idempotency_key);
ALTER TABLE order_items ADD CONSTRAINT order_items_unit_price_check CHECK ((unit_price >= (0)::numeric));
ALTER TABLE order_items ADD CONSTRAINT order_items_quantity_check CHECK ((quantity > 0));
ALTER TABLE order_items ADD CONSTRAINT order_items_line_total_check CHECK ((line_total >= (0)::numeric));
ALTER TABLE order_items ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_movement_type_check CHECK ((movement_type = ANY (ARRAY['in'::text, 'out'::text, 'adjust'::text, 'reserve'::text, 'release'::text, 'sale'::text])));
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_reason_check CHECK (((reason IS NULL) OR (length(reason) <= 300)));
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_pkey PRIMARY KEY (id);
ALTER TABLE notification_tokens ADD CONSTRAINT notification_tokens_pkey PRIMARY KEY (id);
ALTER TABLE notification_tokens ADD CONSTRAINT notification_tokens_token_key UNIQUE (token);
ALTER TABLE business_settings ADD CONSTRAINT business_settings_id_check CHECK ((id = 1));
ALTER TABLE business_settings ADD CONSTRAINT business_settings_pkey PRIMARY KEY (id);
ALTER TABLE orders ADD CONSTRAINT orders_fulfillment_step_check CHECK ((fulfillment_step = ANY (ARRAY['packed'::text, 'out_for_delivery'::text])));
ALTER TABLE order_tracking_attempts ADD CONSTRAINT order_tracking_attempts_pkey PRIMARY KEY (client_key, window_start);
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'staff'::text, 'customer'::text])));
ALTER TABLE order_items ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
ALTER TABLE order_items ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
ALTER TABLE profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE products ADD CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id);
ALTER TABLE notification_tokens ADD CONSTRAINT notification_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE OR REPLACE FUNCTION public.admin_dashboard_summary()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_products jsonb; v_orders jsonb;
begin
  if not public.is_admin() then raise exception 'Not authorized' using errcode = '42501'; end if;
  select jsonb_build_object(
           'total_products',   count(*),
           'total_stock',      coalesce(sum(p.quantity), 0),
           'purchase_value',   coalesce(sum(p.quantity * p.purchase_price), 0),
           'selling_value',    coalesce(sum(p.quantity * p.selling_price), 0),
           'potential_profit', coalesce(sum(p.quantity * (p.selling_price - p.purchase_price)), 0),
           'low_stock',        count(*) filter (where p.quantity > 0 and p.quantity <= p.min_stock_alert),
           'out_of_stock',     count(*) filter (where p.quantity <= 0))
    into v_products from public.products p where p.status <> 'archived';
  select jsonb_build_object(
           'orders_pending',   count(*) filter (where o.status = 'pending'),
           'orders_confirmed', count(*) filter (where o.status in ('confirmed','processing')),
           'orders_completed', count(*) filter (where o.status = 'completed'),
           'orders_cancelled', count(*) filter (where o.status in ('cancelled','rejected')))
    into v_orders from public.orders o;
  return v_products || v_orders;
end $function$
;
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'); $function$
;
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ begin new.updated_at = now(); return new; end $function$
;
CREATE OR REPLACE FUNCTION public.block_movement_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ begin raise exception 'inventory_movements is append-only' using errcode = '42501'; end $function$
;
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, left(nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''), 200), 'customer')
  on conflict (id) do nothing;
  return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.admin_set_fulfillment(p_order_id text, p_step text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'Not authorized' using errcode = '42501'; end if;
  if p_step is not null and p_step not in ('packed', 'out_for_delivery') then raise exception 'Invalid step'; end if;
  begin v_id := p_order_id::uuid;
  exception when invalid_text_representation then raise exception 'Order not found or not accepted yet'; end;
  update public.orders set fulfillment_step = p_step where id = v_id and status in ('confirmed', 'processing');
  if not found then raise exception 'Order not found or not accepted yet'; end if;
end $function$
;
CREATE OR REPLACE FUNCTION public.admin_stock_move(p_product_id uuid, p_type text, p_quantity integer, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_prod public.products%rowtype; v_new bigint;
begin
  if not public.is_admin() then raise exception 'Not authorized' using errcode = '42501'; end if;
  if p_type is null or p_type not in ('in','out','adjust') then raise exception 'Invalid movement type'; end if;
  if p_quantity is null or p_quantity < 0 or p_quantity > 1000000 or (p_type <> 'adjust' and p_quantity = 0) then
    raise exception 'Invalid quantity';
  end if;
  p_reason := left(nullif(btrim(p_reason), ''), 500);
  select * into v_prod from public.products where id = p_product_id for update;
  if not found then raise exception 'Product not found'; end if;
  v_new := case p_type when 'in' then v_prod.quantity::bigint + p_quantity
                       when 'out' then v_prod.quantity::bigint - p_quantity
                       else p_quantity::bigint end;
  if v_new < 0 then raise exception 'Stock cannot be negative'; end if;
  if v_new < v_prod.reserved_quantity then
    raise exception 'Stock cannot go below reserved quantity (%)', v_prod.reserved_quantity;
  end if;
  if v_new > 1000000000 then raise exception 'Invalid quantity'; end if;
  perform pg_catalog.set_config('app.inventory_op', 'on', true);
  update public.products set quantity = v_new::int where id = p_product_id;
  insert into public.inventory_movements
    (product_id, movement_type, quantity_change, reserved_change, quantity_after, reserved_after, reason, created_by)
  values (p_product_id, p_type, v_new::int - v_prod.quantity, 0, v_new::int, v_prod.reserved_quantity, p_reason, (select auth.uid()));
end $function$
;
CREATE OR REPLACE FUNCTION public.set_order_status(p_order_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_order public.orders%rowtype; v_item record; v_prod public.products%rowtype; v_release int; v_ok boolean;
begin
  if not public.is_admin() then raise exception 'Not authorized' using errcode = '42501'; end if;
  if p_status is null or p_status not in ('confirmed','processing','completed','rejected','cancelled') then
    raise exception 'Invalid status';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status in ('completed','rejected','cancelled') then raise exception 'Order is already closed'; end if;
  v_ok := case v_order.status
            when 'pending'    then p_status in ('confirmed','rejected','cancelled')
            when 'confirmed'  then p_status in ('processing','completed','cancelled')
            when 'processing' then p_status in ('completed','cancelled')
            else false end;
  if not v_ok then
    raise exception 'Invalid status transition from % to %', v_order.status, p_status;
  end if;

  if p_status in ('completed','rejected','cancelled') then
    perform pg_catalog.set_config('app.inventory_op', 'on', true);
    for v_item in select * from public.order_items where order_id = p_order_id and product_id is not null order by product_id
    loop
      select * into v_prod from public.products where id = v_item.product_id for update;
      continue when not found;
      if p_status = 'completed' then
        if v_prod.quantity < v_item.quantity or v_prod.reserved_quantity < v_item.quantity then
          raise exception 'Inventory inconsistency for product %: cannot complete order', v_prod.name;
        end if;
        update public.products set quantity = quantity - v_item.quantity, reserved_quantity = reserved_quantity - v_item.quantity where id = v_prod.id;
        insert into public.inventory_movements
          (product_id, movement_type, quantity_change, reserved_change, quantity_after, reserved_after, reason, order_id, created_by)
        values (v_prod.id, 'sale', -v_item.quantity, -v_item.quantity, v_prod.quantity - v_item.quantity, v_prod.reserved_quantity - v_item.quantity,
                'Order #' || v_order.order_number || ' completed', p_order_id, (select auth.uid()));
      else
        v_release := least(v_item.quantity, v_prod.reserved_quantity);
        update public.products set reserved_quantity = reserved_quantity - v_release where id = v_prod.id;
        insert into public.inventory_movements
          (product_id, movement_type, quantity_change, reserved_change, quantity_after, reserved_after, reason, order_id, created_by)
        values (v_prod.id, 'release', 0, -v_release, v_prod.quantity, v_prod.reserved_quantity - v_release,
                'Order #' || v_order.order_number || ' ' || p_status
                  || case when v_release < v_item.quantity then ' (clamped: reservation was short)' else '' end,
                p_order_id, (select auth.uid()));
      end if;
    end loop;
  end if;
  update public.orders set status = p_status where id = p_order_id;
end $function$
;
CREATE OR REPLACE FUNCTION public.place_order(p_customer_name text, p_customer_phone text, p_delivery_address text, p_items jsonb, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_name   text := btrim(p_customer_name);
  v_phone  text := btrim(p_customer_phone);
  v_addr   text := nullif(btrim(p_delivery_address), '');
  v_hash   text;
  v_order  public.orders%rowtype;
  v_line   record;
  v_prod   public.products%rowtype;
  v_line_total numeric;
  v_total  numeric := 0;
begin
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 100 then
    raise exception 'Invalid request';
  end if;
  if v_name is null or char_length(v_name) not between 2 and 100 or v_name ~ '[[:cntrl:]]' then
    raise exception 'Invalid customer name';
  end if;
  if v_phone is null or v_phone !~ '^\+?[0-9 ().-]{7,25}$'
     or char_length(regexp_replace(v_phone, '\D', '', 'g')) not between 7 and 15 then
    raise exception 'Invalid phone number';
  end if;
  if v_addr is not null and (char_length(v_addr) > 500 or v_addr ~ '[[:cntrl:]]') then
    raise exception 'Invalid delivery address';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'Cart is empty or invalid';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) e
     where not coalesce(
       case when jsonb_typeof(e) = 'object'
                 and (e ->> 'product_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                 and (e ->> 'quantity') ~ '^[0-9]{1,3}$'
            then (e ->> 'quantity')::int between 1 and 999
            else false end, false)
  ) then
    raise exception 'Invalid cart item';
  end if;

  select md5(concat_ws('|', lower(v_name), regexp_replace(v_phone, '\D', '', 'g'), coalesce(lower(v_addr), ''),
                       string_agg(m.product_id::text || ':' || m.qty::text, ',' order by m.product_id)))
    into v_hash
    from (select (e ->> 'product_id')::uuid as product_id, sum((e ->> 'quantity')::int) as qty
            from jsonb_array_elements(p_items) e group by 1) m;

  insert into public.orders (customer_name, customer_phone, delivery_address, idempotency_key, request_hash)
  values (v_name, v_phone, v_addr, p_idempotency_key, v_hash)
  on conflict (idempotency_key) do nothing
  returning * into v_order;

  if not found then
    select * into v_order from public.orders where idempotency_key = p_idempotency_key;
    if not found then raise exception 'Please retry'; end if;
    if v_order.request_hash is not null and v_order.request_hash <> v_hash then
      raise exception 'Idempotency key already used for a different order';
    end if;
    return jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number,
                              'total', v_order.total, 'duplicate', true);
  end if;

  perform pg_catalog.set_config('app.inventory_op', 'on', true);

  for v_line in
    select (e ->> 'product_id')::uuid as product_id, sum((e ->> 'quantity')::int)::int as qty
      from jsonb_array_elements(p_items) e group by 1 order by 1
  loop
    if v_line.qty < 1 or v_line.qty > 999 then raise exception 'Invalid quantity'; end if;

    select * into v_prod from public.products p
     where p.id = v_line.product_id and p.status = 'published' for update;
    if not found then raise exception 'A product in your cart is no longer available'; end if;
    if v_prod.selling_price is null or v_prod.selling_price <= 0 then
      raise exception 'A product in your cart is not available for purchase';
    end if;
    if v_prod.quantity - v_prod.reserved_quantity < v_line.qty then
      raise exception 'Not enough stock for %', v_prod.name;
    end if;

    v_line_total := v_prod.selling_price * v_line.qty;

    update public.products set reserved_quantity = reserved_quantity + v_line.qty where id = v_prod.id;

    insert into public.order_items (order_id, product_id, product_name, unit_price, quantity, line_total)
    values (v_order.id, v_prod.id, v_prod.name, v_prod.selling_price, v_line.qty, v_line_total);

    insert into public.inventory_movements
      (product_id, movement_type, quantity_change, reserved_change, quantity_after, reserved_after, reason, order_id)
    values (v_prod.id, 'reserve', 0, v_line.qty, v_prod.quantity, v_prod.reserved_quantity + v_line.qty,
            'Order #' || v_order.order_number, v_order.id);

    v_total := v_total + v_line_total;
  end loop;

  if v_total <= 0 then raise exception 'Invalid order total'; end if;

  update public.orders set total = v_total where id = v_order.id returning * into v_order;

  return jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number,
                            'total', v_order.total, 'duplicate', false);
end $function$
;
CREATE OR REPLACE FUNCTION public.track_orders(p_lookups jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_n        int;
  v_headers  json;
  v_client   text;
  v_bucket   timestamptz;
  v_attempts int;
begin
  if p_lookups is null or jsonb_typeof(p_lookups) <> 'array' then return '[]'::jsonb; end if;
  v_n := jsonb_array_length(p_lookups);
  if v_n = 0 then return '[]'::jsonb; end if;
  if v_n > 20 then raise exception 'Too many lookups' using errcode = '54000'; end if;

  begin
    v_headers := nullif(pg_catalog.current_setting('request.headers', true), '')::json;
  exception when others then
    v_headers := null;
  end;
  v_client := left(coalesce(v_headers ->> 'cf-connecting-ip', v_headers ->> 'x-real-ip',
                            btrim(split_part(v_headers ->> 'x-forwarded-for', ',', 1)), 'unknown'), 100);
  if v_client = '' then v_client := 'unknown'; end if;

  v_bucket := to_timestamp(floor(extract(epoch from now()) / 600) * 600);
  insert into public.order_tracking_attempts as a (client_key, window_start, attempts)
  values (v_client, v_bucket, v_n)
  on conflict (client_key, window_start) do update set attempts = a.attempts + v_n
  returning a.attempts into v_attempts;
  if v_attempts > 60 then
    raise exception 'Too many tracking requests. Please try again later.' using errcode = '54000';
  end if;
  if random() < 0.02 then
    delete from public.order_tracking_attempts where window_start < now() - interval '1 day';
  end if;

  return (
    select coalesce(jsonb_agg(x.j order by x.created_at desc), '[]'::jsonb)
    from (
      select o.created_at,
             jsonb_build_object(
               'order_number', o.order_number,
               'created_at',   o.created_at,
               'total',        o.total,
               'status',       o.status,
               'step',         o.fulfillment_step,
               'items', coalesce((
                  select jsonb_agg(jsonb_build_object('name', i.product_name, 'qty', i.quantity) order by i.product_name)
                    from public.order_items i where i.order_id = o.id
               ), '[]'::jsonb)
             ) as j
        from (
          select distinct
                 case when (l.value ->> 'n') ~ '^[0-9]{1,18}$' then (l.value ->> 'n')::bigint end as n,
                 right(regexp_replace(coalesce(l.value ->> 'p', ''), '\D', '', 'g'), 9)           as p9,
                 length(regexp_replace(coalesce(l.value ->> 'p', ''), '\D', '', 'g'))             as plen
            from jsonb_array_elements(p_lookups) l
        ) q
        join public.orders o
          on o.order_number = q.n
         and q.plen >= 7
         and right(regexp_replace(coalesce(o.customer_phone, ''), '\D', '', 'g'), 9) = q.p9
       limit 20
    ) x
  );
end $function$
;
CREATE OR REPLACE FUNCTION public.profiles_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'DELETE' then
    if old.role = 'admin' and not exists (select 1 from public.profiles p where p.role = 'admin' and p.id <> old.id) then
      raise exception 'Cannot remove the last administrator';
    end if;
    return old;
  end if;
  if new.id is distinct from old.id then raise exception 'Profile id is immutable'; end if;
  if new.role is distinct from old.role then
    if (select auth.uid()) is not null and not public.is_admin() then
      raise exception 'Not authorized to change role' using errcode = '42501';
    end if;
    if old.role = 'admin' and new.role <> 'admin'
       and not exists (select 1 from public.profiles p where p.role = 'admin' and p.id <> old.id) then
      raise exception 'Cannot remove the last administrator';
    end if;
  end if;
  return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.orders_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_ok boolean;
begin
  if new.order_number is distinct from old.order_number or new.idempotency_key is distinct from old.idempotency_key then
    raise exception 'order_number and idempotency_key are immutable';
  end if;
  if new.status is distinct from old.status then
    v_ok := case old.status
              when 'pending'    then new.status in ('confirmed','rejected','cancelled')
              when 'confirmed'  then new.status in ('processing','completed','cancelled')
              when 'processing' then new.status in ('completed','cancelled')
              else false end;
    if not v_ok then
      raise exception 'Invalid status transition from % to %', old.status, new.status;
    end if;
  end if;
  return new;
end $function$
;
CREATE TRIGGER trg_profiles_upd BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_categories_upd BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_products_upd BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_orders_upd BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_tokens_upd BEFORE UPDATE ON public.notification_tokens FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_settings_upd BEFORE UPDATE ON public.business_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_movements_no_truncate BEFORE TRUNCATE ON public.inventory_movements FOR EACH STATEMENT EXECUTE FUNCTION block_movement_changes();
CREATE TRIGGER trg_profiles_guard BEFORE DELETE OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION profiles_guard();
CREATE TRIGGER trg_orders_guard BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION orders_guard();
CREATE TRIGGER trg_movements_append_only BEFORE DELETE OR UPDATE ON public.inventory_movements FOR EACH ROW EXECUTE FUNCTION block_movement_changes();
create view public.public_products as  SELECT p.id,
    p.name,
    p.description,
    p.images,
    p.selling_price,
    p.category_id,
    c.name AS category_name,
        CASE
            WHEN (p.quantity - p.reserved_quantity) <= 0 THEN 'out_of_stock'::text
            WHEN (p.quantity - p.reserved_quantity) <= p.min_stock_alert THEN 'low_stock'::text
            ELSE 'in_stock'::text
        END AS stock_status
   FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
  WHERE p.status = 'published'::text;
alter table public.categories enable row level security;
alter table public.business_settings enable row level security;
alter table public.products enable row level security;
alter table public.profiles enable row level security;
alter table public.order_items enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.notification_tokens enable row level security;
alter table public.order_tracking_attempts enable row level security;
alter table public.orders enable row level security;
create policy categories_admin_write on public.categories for ALL to authenticated using (( SELECT is_admin() AS is_admin)) with check (( SELECT is_admin() AS is_admin));
create policy categories_read on public.categories for SELECT to anon,authenticated using (true) ;
create policy settings_admin_write on public.business_settings for UPDATE to authenticated using (( SELECT is_admin() AS is_admin)) with check (( SELECT is_admin() AS is_admin));
create policy settings_read on public.business_settings for SELECT to anon,authenticated using (true) ;
create policy products_admin_all on public.products for ALL to authenticated using (( SELECT is_admin() AS is_admin)) with check (( SELECT is_admin() AS is_admin));
create policy profiles_admin_all on public.profiles for ALL to authenticated using (( SELECT is_admin() AS is_admin)) with check (( SELECT is_admin() AS is_admin));
create policy profiles_select_own on public.profiles for SELECT to authenticated using ((id = ( SELECT auth.uid() AS uid))) ;
create policy order_items_admin_read on public.order_items for SELECT to authenticated using (( SELECT is_admin() AS is_admin)) ;
create policy movements_admin_read on public.inventory_movements for SELECT to authenticated using (( SELECT is_admin() AS is_admin)) ;
create policy tokens_own on public.notification_tokens for ALL to authenticated using ((( SELECT is_admin() AS is_admin) AND (user_id = ( SELECT auth.uid() AS uid)))) with check ((( SELECT is_admin() AS is_admin) AND (user_id = ( SELECT auth.uid() AS uid))));
create policy orders_admin_read on public.orders for SELECT to authenticated using (( SELECT is_admin() AS is_admin)) ;
grant select on all tables in schema public to authenticated;
grant select on public.public_products,public.categories,public.business_settings to anon;
grant insert,update,delete on public.products,public.categories,public.profiles to authenticated;
grant update on public.business_settings to authenticated;
