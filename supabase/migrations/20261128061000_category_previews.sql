-- Use the existing public catalogue projection and return at most four products per category.
create function public.category_previews()
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(preview) order by category.id, preview.name, preview.id), '[]'::jsonb)
  from public.categories as category
  cross join lateral (
    select product.*
    from public.public_products as product
    where product.category_id = category.id
    order by product.name, product.id
    limit 4
  ) as preview;
$$;

revoke execute on function public.category_previews() from public;
grant execute on function public.category_previews() to anon, authenticated;
