-- Defence in depth: the function itself also rejects missing and anonymous-sign-in identities.
-- CREATE OR REPLACE keeps the existing privileges, so the revokes above stay in force.
create or replace function public.checkout_v8(p_customer_name text,p_customer_phone text,p_delivery_address text,p_items jsonb,p_idempotency_key text,p_coupon text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb; o public.orders%rowtype; pricing jsonb; v_code text:=nullif(upper(trim(p_coupon)),'');
begin
 -- Checkout needs a real signed-in account: reject the anon role and Supabase anonymous sign-ins (role authenticated, is_anonymous claim).
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in to place an order'; end if;
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
