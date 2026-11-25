-- Keep catalogue, quote and order tracking available to visitors.
-- Require the authenticated role on both order submission entry points.
revoke execute on function public.checkout_v8(text,text,text,jsonb,text,text) from public, anon;
revoke execute on function public.place_order(text,text,text,jsonb,text) from public, anon;
