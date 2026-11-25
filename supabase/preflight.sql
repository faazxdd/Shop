-- Read-only metadata checks. No customer rows or credentials are selected.
select version();
select table_name,column_name,data_type from information_schema.columns
where table_schema='public' and table_name in ('products','orders','order_items','profiles','business_settings')
order by table_name,ordinal_position;
select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies
where schemaname in ('public','storage');
select p.oid::regprocedure as function,p.prosecdef as security_definer,p.proconfig
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public';
select pg_get_viewdef('public.public_products'::regclass,true);
select pg_get_triggerdef(oid) from pg_trigger where tgrelid='auth.users'::regclass and not tgisinternal;
