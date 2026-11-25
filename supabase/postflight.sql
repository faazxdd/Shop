-- Read-only structural verification. Run only after the reviewed migration.
select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname in ('public','private') and c.relkind='r' order by n.nspname,c.relname;
select has_function_privilege('anon','private.place_order(text,text,text,jsonb,text)','EXECUTE') as must_be_false,
       has_table_privilege('anon','private.order_costs','SELECT') as must_also_be_false,
       has_table_privilege('authenticated','public.audit_logs','DELETE') as must_be_false_too;
select column_name from information_schema.columns where table_schema='public' and table_name='public_products';
select pg_get_viewdef('public.public_products'::regclass,true);
select pg_get_functiondef('public.checkout_v8(text,text,text,jsonb,text,text)'::regprocedure);
select pg_get_functiondef('public.admin_sales_summary(timestamptz,timestamptz)'::regprocedure);
-- Must produce zero rows; does not expose customer information.
select id from public.products where quantity<0 or reserved_quantity<0 or reserved_quantity>quantity;
