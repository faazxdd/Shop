import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('schema upgrade, ownership, checkout, stock, coupons and audit', async () => {
 const db = new PGlite();
 try {
 await db.exec(await readFile('tests/fixtures/production-schema.sql','utf8'));
 for(const f of (await readdir('supabase/migrations')).sort()) await db.exec(await readFile('supabase/migrations/'+f,'utf8'));
 await db.exec(`insert into auth.users values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
 insert into profiles(id,role) values ('00000000-0000-0000-0000-000000000001','admin'),('00000000-0000-0000-0000-000000000002','customer');
 insert into business_settings(id,delivery_charge) values(1,10);
 insert into products(id,name,selling_price,purchase_price,quantity,status) values ('10000000-0000-0000-0000-000000000001','Phone',100,40,3,'published');
 insert into coupons(code,kind,value,max_uses) values('SAVE10','percent',10,1);`);
 const items=JSON.stringify([{product_id:'10000000-0000-0000-0000-000000000001',quantity:2}]);
 const checkout=()=>db.query(`select checkout_v8('Test Customer','+971501234567','Dubai',$1::jsonb,'test-key-123','SAVE10') r`,[items]);
 await db.exec(`set role anon`);
 assert.equal((await db.query('select * from public_products')).rows.length,1);
 await assert.rejects(db.query('select purchase_price from products'));
 await assert.rejects(db.query('select * from coupons'));
 const order=(await checkout()).rows[0].r; assert.equal(order.total,190);
 assert.equal((await checkout()).rows[0].r.order_id,order.order_id);
 await assert.rejects(db.query(`select checkout_v8('Test Customer','+971501234567','Dubai',$1::jsonb,'other-key-123',null)`,[items]),/Not enough stock/);
 await assert.rejects(db.query(`select quote_order($1::jsonb,'SAVE10')`,[JSON.stringify([{product_id:'10000000-0000-0000-0000-000000000001',quantity:1}])]),/Coupon/);
 await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false)`);
 assert.equal((await db.query('select * from orders')).rows.length,0);
 assert.equal((await db.query('select * from admin_order_costs')).rows.length,0);
 await assert.rejects(db.query(`update profiles set role='admin' where id=auth.uid()`),/Not authorized/);
 await assert.rejects(db.query(`select set_order_status($1,'confirmed')`,[order.order_id]),/Not authorized/);
 await db.exec(`select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false)`);
 await db.query(`select set_order_status($1,'confirmed')`,[order.order_id]);
 await db.query(`select set_order_status($1,'completed')`,[order.order_id]);
 assert.equal((await db.query('select quantity from products')).rows[0].quantity,1);
 await db.query('update products set purchase_price=90');
 assert.equal(Number((await db.query('select unit_cost from admin_order_costs')).rows[0].unit_cost),40);
 assert.ok((await db.query('select * from audit_logs')).rows.length>0);
 await assert.rejects(db.query('delete from audit_logs'));
 await assert.rejects(db.query(`select set_order_status($1,'cancelled')`,[order.order_id]),/already closed/);
 } finally { await db.close(); }
});

test('customer ownership, forged prices, discounts, legacy API and stock rollback',async()=>{
 const db=new PGlite();
 try{
 await db.exec(await readFile('tests/fixtures/production-schema.sql','utf8'));
 for(const f of (await readdir('supabase/migrations')).sort())await db.exec(await readFile('supabase/migrations/'+f,'utf8'));
 await db.exec(`insert into auth.users values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000003');
 insert into profiles(id,role) values('00000000-0000-0000-0000-000000000001','admin'),('00000000-0000-0000-0000-000000000002','customer'),('00000000-0000-0000-0000-000000000003','customer');
 insert into business_settings(id,delivery_charge,free_delivery_above)values(1,15,150);
 set role authenticated;select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false)`);
 const product=(await db.query(`select * from admin_create_product($1::jsonb,5)`,[JSON.stringify({name:'Variant phone',selling_price:100,purchase_price:40,status:'published',variant_group:'phone',attributes:{Colour:'Black'},images:[]})])).rows[0];
 assert.equal(product.quantity,5);
 await assert.rejects(db.query('update products set quantity=10 where id=$1',[product.id]),/audited/);
 await assert.rejects(db.query(`select admin_create_product('{"name":"Bad product"}',-1)`),/Invalid quantity/);
 await db.exec(`reset role;insert into coupons(code,kind,value)values('FREE','fixed',1000);set role authenticated;select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false)`);
 const items=JSON.stringify([{product_id:product.id,quantity:2,unit_price:0,purchase_price:0}]);
 const quote=(await db.query('select quote_order($1::jsonb,null) q',[items])).rows[0].q;
 assert.equal(quote.total,200);assert.equal(quote.delivery_charge,0);
 await assert.rejects(db.query(`select checkout_v8('Customer','+971501234567','Dubai',$1::jsonb,'rollback-key','WRONG')`,[items]),/Coupon/);
 assert.equal((await db.query('select * from orders')).rows.length,0);
 const o=(await db.query(`select place_order('Customer','+971501234567','Dubai',$1::jsonb,'customer-order-key') o`,[items])).rows[0].o;
 assert.equal(o.total,200);assert.equal((await db.query('select * from orders')).rows.length,1);assert.equal((await db.query('select * from order_items')).rows.length,1);
 await assert.rejects(db.query(`select checkout_v8('Other Customer','+971501234567','Dubai',$1::jsonb,'customer-order-key',null)`,[items]),/Idempotency/);
 assert.equal((await db.query('select * from products')).rows.length,0);
 assert.equal((await db.query('select * from inventory_movements')).rows.length,0);
 assert.equal((await db.query('select * from audit_logs')).rows.length,0);
 await db.exec(`select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false)`);
 assert.equal((await db.query('select * from orders')).rows.length,0);assert.equal((await db.query('select * from order_items')).rows.length,0);
 await assert.rejects(db.query(`select checkout_v8('Customer','+971501234567','Dubai',$1::jsonb,'customer-order-key',null)`,[items]),/Idempotency/);
 await db.exec(`select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false)`);
 await db.query(`select set_order_status($1,'cancelled')`,[o.order_id]);
 const stock=(await db.query('select quantity,reserved_quantity from products where id=$1',[product.id])).rows[0];assert.equal(stock.quantity,5);assert.equal(stock.reserved_quantity,0);
 const free=(await db.query('select quote_order($1::jsonb,$2) q',[items,'FREE'])).rows[0].q;assert.equal(free.discount_total,200);assert.equal(free.total,15);
 await assert.rejects(db.query(`select quote_order($1::jsonb,null)`,[JSON.stringify([{product_id:product.id,quantity:0}])]),/Invalid quantity/);
 await assert.rejects(db.query(`select private.place_order('Customer','+971501234567','Dubai',$1::jsonb,'private-key')`,[items]),/permission/);
 }finally{await db.close()}
});
