-- Additive V8 migration. Rehearse against a schema-compatible staging database first.
begin;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, anon;

alter table public.products add column if not exists compare_at_price numeric(12,2);
alter table public.products add column if not exists variant_group text;
alter table public.products add column if not exists attributes jsonb not null default '{}';
alter table public.products add constraint products_compare_price check (compare_at_price is null or compare_at_price >= selling_price);
alter table public.products add constraint products_attributes check (jsonb_typeof(attributes)='object' and octet_length(attributes::text)<=2000);
alter table public.products add constraint products_variant_group check (length(variant_group)<=100);
create index products_variant_group_idx on public.products(variant_group) where variant_group is not null;
create index products_catalogue_idx on public.products(status,category_id,selling_price,id);
alter table public.orders add column if not exists customer_id uuid references auth.users(id) on delete set null;
alter table public.orders add column if not exists subtotal numeric(12,2);
alter table public.orders add column if not exists discount_total numeric(12,2) not null default 0 check(discount_total>=0);
alter table public.orders add column if not exists delivery_charge numeric(12,2) not null default 0 check(delivery_charge>=0);
alter table public.orders add column if not exists coupon_code text;
create index orders_customer_idx on public.orders(customer_id,created_at desc);
create index if not exists order_items_order_idx on public.order_items(order_id);
alter table public.business_settings add column if not exists delivery_charge numeric(12,2) not null default 0 check(delivery_charge>=0);
alter table public.business_settings add column if not exists free_delivery_above numeric(12,2) check(free_delivery_above>=0);

create table public.coupons (
 code text primary key check(code ~ '^[A-Z0-9_-]{3,32}$'),
 kind text not null check(kind in ('percent','fixed')),
 value numeric(12,2) not null check(value>0),
 minimum_order numeric(12,2) not null default 0 check(minimum_order>=0),
 active boolean not null default true,
 expires_at timestamptz,
 max_uses integer check(max_uses>0), uses integer not null default 0 check(uses>=0),
 check(kind <> 'percent' or value<=100)
);
alter table public.coupons enable row level security;
revoke all on public.coupons from anon,authenticated;
grant select,insert,update,delete on public.coupons to authenticated;
create policy coupons_admin on public.coupons to authenticated using((select public.is_admin())) with check((select public.is_admin()));
create table private.order_costs (
 item_id uuid primary key references public.order_items(id),
 unit_cost numeric(12,2) not null check(unit_cost>=0)
);
alter table private.order_costs enable row level security;
grant select on private.order_costs to authenticated;
create policy costs_admin on private.order_costs for select to authenticated using((select public.is_admin()));
create view public.admin_order_costs with(security_invoker=true) as select * from private.order_costs;
grant select on public.admin_order_costs to authenticated;
revoke all on public.admin_order_costs from anon;

create table public.audit_logs (
 id bigint generated always as identity primary key,
 actor_id uuid, action text not null, entity text not null, entity_id text,
 changed_fields text[] not null, created_at timestamptz not null default now()
);
alter table public.audit_logs enable row level security;
revoke all on public.audit_logs from anon,authenticated;
grant select on public.audit_logs to authenticated;
create policy audit_admin on public.audit_logs for select to authenticated using((select public.is_admin()));
create index audit_logs_date_idx on public.audit_logs(created_at desc);
create function private.audit_change() returns trigger language plpgsql security definer set search_path='' as $$
declare a jsonb := coalesce(to_jsonb(new),'{}'); b jsonb := coalesce(to_jsonb(old),'{}'); fields text[];
begin
 select array_agg(key order by key) into fields from jsonb_object_keys(a||b) key where a->key is distinct from b->key;
 insert into public.audit_logs(actor_id,action,entity,entity_id,changed_fields)
 values(auth.uid(),tg_op,tg_table_name,coalesce(a->>'id',b->>'id',a->>'code',b->>'code'),coalesce(fields,'{}'));
 return coalesce(new,old);
end $$;
revoke all on function private.audit_change() from public,anon,authenticated;
create trigger audit_products after insert or update or delete on public.products for each row execute function private.audit_change();
create trigger audit_orders after insert or update on public.orders for each row execute function private.audit_change();
create trigger audit_settings after update on public.business_settings for each row execute function private.audit_change();
create trigger audit_coupons after insert or update or delete on public.coupons for each row execute function private.audit_change();
create trigger audit_profiles after update or delete on public.profiles for each row execute function private.audit_change();

create function private.capture_cost() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into private.order_costs(item_id,unit_cost) select new.id,purchase_price from public.products where id=new.product_id;
 return new;
end $$;
revoke all on function private.capture_cost() from public,anon,authenticated;
create trigger capture_order_cost after insert on public.order_items for each row execute function private.capture_cost();

-- Caller-owned reads do not grant updates to orders or access to cost snapshots.
create policy orders_customer_read on public.orders for select to authenticated using(customer_id=(select auth.uid()));
create policy items_customer_read on public.order_items for select to authenticated using(exists(select 1 from public.orders o where o.id=order_id and o.customer_id=(select auth.uid())));
create policy profile_update_name on public.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
-- Existing profiles_guard rejects role changes; immutable id guard remains in place.

-- Explicit public projection: keep owner-rights view because base products contain private costs.
-- Do NOT grant customers SELECT on products or turn this into SELECT *.
create or replace view public.public_products with(security_barrier=true) as
select p.id,p.name,p.description,p.images,p.selling_price,p.category_id,c.name as category_name,
case when p.quantity-p.reserved_quantity<=0 then 'out_of_stock' when p.quantity-p.reserved_quantity<=p.min_stock_alert then 'low_stock' else 'in_stock' end as stock_status,
p.brand,p.sku,p.compare_at_price,p.variant_group,p.attributes
from public.products p left join public.categories c on c.id=p.category_id where p.status='published';
grant select on public.public_products to anon,authenticated;

-- Preserve the audited stock reservation implementation behind a private entry point.
alter function public.place_order(text,text,text,jsonb,text) set schema private;
revoke all on function private.place_order(text,text,text,jsonb,text) from public,anon,authenticated;

create function private.price_adjustments(p_subtotal numeric,p_coupon text) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.coupons%rowtype; s public.business_settings%rowtype; d numeric:=0; shipping numeric:=0;
begin
 if p_coupon is not null then
  select * into c from public.coupons where code=p_coupon;
  if not found or not c.active or (c.expires_at is not null and c.expires_at<=now()) or (c.max_uses is not null and c.uses>=c.max_uses) or p_subtotal<c.minimum_order then raise exception 'Coupon is invalid, expired or minimum order not reached'; end if;
  d:=least(p_subtotal,round(case when c.kind='percent' then p_subtotal*c.value/100 else c.value end,2));
 end if;
 select * into s from public.business_settings where id=1;
 shipping:=case when s.free_delivery_above is not null and p_subtotal-d>=s.free_delivery_above then 0 else coalesce(s.delivery_charge,0) end;
 return jsonb_build_object('subtotal',p_subtotal,'discount_total',d,'delivery_charge',shipping,'total',p_subtotal-d+shipping);
end $$;
revoke all on function private.price_adjustments(numeric,text) from public,anon,authenticated;

create function public.quote_order(p_items jsonb,p_coupon text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare l record; p public.products%rowtype; subtotal numeric:=0;
begin
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 50 then raise exception 'Invalid cart'; end if;
 for l in select (x->>'product_id')::uuid id,sum((x->>'quantity')::numeric) qty from jsonb_array_elements(p_items) x group by 1 order by 1 loop
  if l.qty is null or l.qty<>trunc(l.qty) or l.qty not between 1 and 999 then raise exception 'Invalid quantity'; end if;
  select * into p from public.products where id=l.id and status='published';
  if not found or p.selling_price<=0 then raise exception 'A product is no longer available'; end if;
  if p.quantity-p.reserved_quantity<l.qty then raise exception 'Not enough stock for %',p.name; end if;
  subtotal:=subtotal+p.selling_price*l.qty;
 end loop;
 return private.price_adjustments(subtotal,nullif(upper(trim(p_coupon)),''));
end $$;
revoke all on function public.quote_order(jsonb,text) from public;
grant execute on function public.quote_order(jsonb,text) to anon,authenticated;

create function public.checkout_v8(p_customer_name text,p_customer_phone text,p_delivery_address text,p_items jsonb,p_idempotency_key text,p_coupon text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb; o public.orders%rowtype; pricing jsonb; v_code text:=nullif(upper(trim(p_coupon)),'');
begin
 -- Same key serializes across callers. Existing reservation code locks each product in UUID order.
 if p_idempotency_key is null or length(p_idempotency_key) not between 8 and 100 then raise exception 'Invalid request'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key,0));
 select * into o from public.orders where idempotency_key=p_idempotency_key;
 if found then
  if o.customer_id is distinct from auth.uid() or o.coupon_code is distinct from v_code then raise exception 'Idempotency key already used for a different order'; end if;
 else
  if v_code is not null then perform 1 from public.coupons where coupons.code=v_code for update; end if;
  perform 1 from public.business_settings where id=1 for share;
 end if;
 r:=private.place_order(p_customer_name,p_customer_phone,p_delivery_address,p_items,p_idempotency_key);
 if (r->>'duplicate')::boolean then return r; end if;
 pricing:=private.price_adjustments((r->>'total')::numeric,v_code);
 update public.orders set customer_id=auth.uid(),subtotal=(pricing->>'subtotal')::numeric,
 discount_total=(pricing->>'discount_total')::numeric,delivery_charge=(pricing->>'delivery_charge')::numeric,
 total=(pricing->>'total')::numeric,coupon_code=v_code where id=(r->>'order_id')::uuid;
 if v_code is not null then update public.coupons set uses=uses+1 where coupons.code=v_code; end if;
 return r||pricing;
end $$;
revoke all on function public.checkout_v8(text,text,text,jsonb,text,text) from public;
grant execute on function public.checkout_v8(text,text,text,jsonb,text,text) to anon,authenticated;
-- Old clients remain compatible and use the same authoritative delivery pricing.
create function public.place_order(p_customer_name text,p_customer_phone text,p_delivery_address text,p_items jsonb,p_idempotency_key text) returns jsonb language sql security invoker set search_path='' as $$
 select public.checkout_v8(p_customer_name,p_customer_phone,p_delivery_address,p_items,p_idempotency_key,null);
$$;
revoke all on function public.place_order(text,text,text,jsonb,text) from public;
grant execute on function public.place_order(text,text,text,jsonb,text) to anon,authenticated;
create function private.guard_stock() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user in ('anon','authenticated') and (new.quantity is distinct from old.quantity or new.reserved_quantity is distinct from old.reserved_quantity) then
 raise exception 'Use the audited stock operation' using errcode='42501'; end if;
 return new;
end $$;
revoke all on function private.guard_stock() from public;
create trigger guard_stock before update on public.products for each row execute function private.guard_stock();

-- Product creation plus initial stock is one transaction; retries cannot leave a half-created SKU.
create function public.admin_create_product(p_product jsonb,p_initial_quantity integer default 0)
returns public.products language plpgsql security definer set search_path='' as $$
declare p public.products%rowtype;
begin
 if not public.is_admin() then raise exception 'Not authorized' using errcode='42501'; end if;
 if p_initial_quantity is null or p_initial_quantity not between 0 and 1000000 then raise exception 'Invalid quantity'; end if;
 insert into public.products(name,sku,brand,category_id,description,images,purchase_price,selling_price,min_stock_alert,status,compare_at_price,variant_group,attributes)
 values(trim(p_product->>'name'),nullif(trim(p_product->>'sku'),''),nullif(trim(p_product->>'brand'),''),nullif(p_product->>'category_id','')::uuid,
 p_product->>'description',array(select jsonb_array_elements_text(coalesce(p_product->'images','[]'))),
 coalesce((p_product->>'purchase_price')::numeric,0),coalesce((p_product->>'selling_price')::numeric,0),coalesce((p_product->>'min_stock_alert')::int,5),
 coalesce(p_product->>'status','draft'),(p_product->>'compare_at_price')::numeric,nullif(trim(p_product->>'variant_group'),''),coalesce(p_product->'attributes','{}')) returning * into p;
 if p_initial_quantity>0 then perform public.admin_stock_move(p.id,'in',p_initial_quantity,'Initial stock'); end if;
 select * into p from public.products where id=p.id;
 return p;
end $$;
revoke all on function public.admin_create_product(jsonb,integer) from public,anon;
grant execute on function public.admin_create_product(jsonb,integer) to authenticated;
-- Only the audited RPC may initialize stock. Existing clients insert zero then call stock RPC.
create function private.guard_initial_stock() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user in ('anon','authenticated') and (new.quantity<>0 or new.reserved_quantity<>0) then
 raise exception 'Use the audited stock operation' using errcode='42501'; end if;
 return new;
end $$;
revoke all on function private.guard_initial_stock() from public;
create trigger guard_initial_stock before insert on public.products for each row execute function private.guard_initial_stock();

create function public.admin_sales_summary(p_from timestamptz default null,p_to timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.is_admin() then raise exception 'Not authorized' using errcode='42501'; end if;
 with selected as (select * from public.orders where status='completed' and (p_from is null or created_at>=p_from) and (p_to is null or created_at<=p_to)),
 totals as (select count(*) orders,coalesce(sum(total-delivery_charge),0) revenue,coalesce(sum(delivery_charge),0) delivery,coalesce(sum(discount_total),0) discounts from selected),
 costs as (select coalesce(sum(c.unit_cost*i.quantity),0) cost,count(*) filter(where c.item_id is null) unknown from selected o join public.order_items i on i.order_id=o.id left join private.order_costs c on c.item_id=i.id)
 select jsonb_build_object('orders',t.orders,'revenue',t.revenue,'delivery',t.delivery,'discounts',t.discounts,'cost',c.cost,'profit',t.revenue-c.cost,'unknown_cost_items',c.unknown) into result from totals t cross join costs c;
 return result;
end $$;
revoke all on function public.admin_sales_summary(timestamptz,timestamptz) from public,anon;
grant execute on function public.admin_sales_summary(timestamptz,timestamptz) to authenticated;
commit;
