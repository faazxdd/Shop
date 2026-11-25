import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import EmbeddedPostgres from 'embedded-postgres';

test('PostgreSQL 17 concurrent orders never oversell or redeem a coupon twice',{timeout:60000},async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'fz-pg-'));
 const pg=new EmbeddedPostgres({databaseDir:dir,user:'postgres',password:randomUUID(),port:55439,persistent:false,autoRehydrateSymlinks:true,postgresFlags:['-h','127.0.0.1'],onLog:()=>{},onError:()=>{}});
 const clients=[];
 try{
 await pg.initialise();await pg.start();
 const admin=pg.getPgClient();await admin.connect();clients.push(admin);
 await admin.query(await readFile('tests/fixtures/production-schema.sql','utf8'));
 for(const file of (await readdir('supabase/migrations')).sort())await admin.query(await readFile('supabase/migrations/'+file,'utf8'));
 await admin.query(`insert into business_settings(id)values(1);insert into products(id,name,selling_price,quantity,status)values('10000000-0000-0000-0000-000000000001','Last phone',100,1,'published'),('10000000-0000-0000-0000-000000000002','Other phone',100,10,'published');insert into coupons(code,kind,value,max_uses)values('ONCE','fixed',5,1);`);
 for(let i=0;i<8;i++){const c=pg.getPgClient();await c.connect();await c.query('set role anon');clients.push(c)}
 const call=(c,id,key,coupon=null)=>c.query(`select checkout_v8('Test Customer','+971501234567','Dubai',$1::jsonb,$2,$3) o`,[JSON.stringify([{product_id:id,quantity:1}]),key,coupon]);
 const results=await Promise.allSettled(clients.slice(1).map((c,i)=>call(c,'10000000-0000-0000-0000-000000000001','parallel-stock-'+i)));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.ok(results.filter(r=>r.status==='rejected').every(r=>/Not enough stock/.test(r.reason.message)));
 const same=await Promise.all(clients.slice(1).map(c=>call(c,'10000000-0000-0000-0000-000000000002','same-idempotency-key')));
 assert.equal(new Set(same.map(r=>r.rows[0].o.order_id)).size,1);
 const coupon=await Promise.allSettled(clients.slice(1).map((c,i)=>call(c,'10000000-0000-0000-0000-000000000002','parallel-coupon-'+i,'ONCE')));
 assert.equal(coupon.filter(r=>r.status==='fulfilled').length,1);
 const row=(await admin.query(`select quantity,reserved_quantity from products where id='10000000-0000-0000-0000-000000000002'`)).rows[0];assert.equal(row.quantity,10);assert.equal(row.reserved_quantity,2);
 assert.equal((await admin.query("select uses from coupons where code='ONCE'")).rows[0].uses,1);
 }finally{await Promise.all(clients.map(c=>c.end()));await pg.stop()}
});
