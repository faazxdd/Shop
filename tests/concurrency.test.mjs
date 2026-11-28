import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import EmbeddedPostgres from 'embedded-postgres';

test('PostgreSQL 17 concurrent orders never oversell or redeem a coupon twice',{timeout:60000},async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'fz-pg-'));
 const logs=[];
 const pg=new EmbeddedPostgres({databaseDir:dir,user:'postgres',password:randomUUID(),port:55439,persistent:false,autoRehydrateSymlinks:true,postgresFlags:['-h','127.0.0.1','-c','unix_socket_directories='],onLog:message=>logs.push(message)});
 const clients=[];
 let started=false;
 try{
 await pg.initialise();
 try{await pg.start();started=true}catch(cause){throw new Error('PostgreSQL failed to start: '+logs.join(''),{cause})}
 const admin=pg.getPgClient();await admin.connect();clients.push(admin);
 await admin.query(await readFile('tests/fixtures/production-schema.sql','utf8'));
 for(const file of (await readdir('supabase/migrations')).sort())await admin.query(await readFile('supabase/migrations/'+file,'utf8'));
 await admin.query(`insert into business_settings(id)values(1);insert into products(id,name,selling_price,quantity,status)values('10000000-0000-0000-0000-000000000001','Last phone',100,1,'published'),('10000000-0000-0000-0000-000000000002','Other phone',100,10,'published');insert into coupons(code,kind,value,max_uses)values('ONCE','fixed',5,1);`);
 const userId=randomUUID();
 await admin.query('insert into auth.users(id) values($1)',[userId]);
 await admin.query("insert into profiles(id,role) values($1,'customer')",[userId]);
 for(let i=0;i<8;i++){
  const c=pg.getPgClient();await c.connect();clients.push(c);
  await c.query('set role authenticated');
  await c.query("select set_config('request.jwt.claim.sub',$1,false)",[userId]);
 }
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
 const limited=await Promise.allSettled(clients.slice(1).map((c,i)=>call(c,'10000000-0000-0000-0000-000000000002','parallel-limit-'+i)));
 assert.equal(limited.filter(r=>r.status==='fulfilled').length,2);
 const denied=limited.filter(r=>r.status==='rejected');
 assert.equal(denied.length,6);
 assert.ok(denied.every(r=>r.reason.code==='PT429'));
 const retry=await call(clients[1],'10000000-0000-0000-0000-000000000002','same-idempotency-key');
 assert.equal(retry.rows[0].o.order_id,same[0].rows[0].o.order_id);
 assert.equal((await admin.query('select count(*)::int as count from orders where customer_id=$1',[userId])).rows[0].count,5);
 }finally{await Promise.allSettled(clients.map(c=>c.end()));if(started)await pg.stop();else await rm(dir,{recursive:true,force:true})}
});
