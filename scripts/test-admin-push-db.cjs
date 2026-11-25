// In-memory PostgreSQL only. Never connects to Supabase or reads application credentials.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const modulePath = process.env.PGLITE_MODULE || '@electric-sql/pglite';
const { PGlite } = require(modulePath);
(async () => {
 const db = new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create table auth.users(id uuid primary key,email_confirmed_at timestamptz);
 create table public.profiles(id uuid primary key,role text);
 create table public.admin_settings(settings_key text primary key,settings_value jsonb);
 create table public.appointments(id uuid primary key,status text,start_at timestamptz,booking_source text);`);
 await db.exec(fs.readFileSync('supabase/migrations/202611250001_admin_web_push.sql','utf8'));
 const q = async (sql,args=[]) => (await db.query(sql,args)).rows;
 const count = async table => Number((await q(`select count(*) n from public.${table}`))[0].n);
 const a=randomUUID(),b=randomUUID(),c=randomUUID();
 await q("insert into profiles values ($1,'admin'),($2,'admin'),($3,'customer')",[a,b,c]);
 const sub = async (admin,endpoint) => (await q("select admin_push_subscribe($1,$2,'key','auth','public','en') id",[admin,endpoint]))[0].id;
 const s1=await sub(a,'https://fcm.googleapis.com/a'),s2=await sub(a,'https://fcm.googleapis.com/b');
 assert.notEqual(s1,s2);assert.equal(await sub(a,'https://fcm.googleapis.com/a'),s1);
 await assert.rejects(sub(b,'https://fcm.googleapis.com/a'));
 await assert.rejects(sub(c,'https://fcm.googleapis.com/c'));
 for(const role of ['anon','authenticated']) { await db.exec(`set role ${role}`);await assert.rejects(q('select * from public.admin_push_subscriptions'));await assert.rejects(q('select admin_push_claim()'));await db.exec('reset role'); }
 const u=randomUUID();await q('insert into auth.users values($1,null)',[u]);await q("insert into profiles values($1,'customer')",[u]);assert.equal(await count('admin_push_events'),0);
 await q('update auth.users set email_confirmed_at=now() where id=$1',[u]);assert.equal(await count('admin_push_events'),1);assert.equal(await count('admin_push_deliveries'),2);
 await q('update auth.users set email_confirmed_at=now() where id=$1',[u]);assert.equal(await count('admin_push_events'),1);
 const admin=randomUUID();await q('insert into auth.users values($1,now())',[admin]);await q("insert into profiles values($1,'admin')",[admin]);assert.equal(await count('admin_push_events'),1);
 const ap=randomUUID();await db.exec('begin');await q("insert into appointments values($1,'confirmed',now(),'customer')",[ap]);await db.exec('rollback');assert.equal(await count('admin_push_events'),1);
 await q("insert into appointments values($1,'confirmed','2026-07-01T12:30:00Z','customer')",[ap]);assert.equal(await count('admin_push_deliveries'),4);
 await q("update appointments set status='confirmed' where id=$1",[ap]);assert.equal(await count('admin_push_events'),2);
 await q("update appointments set status='completed' where id=$1",[ap]);assert.equal(await count('admin_push_deliveries'),4);
 await q("insert into appointments values($1,'confirmed',now(),'admin')",[randomUUID()]);assert.equal(await count('admin_push_deliveries'),4);
 await q(`insert into admin_settings values('notifications','{"push":{"completed":true,"adminBookings":true}}')`);
 const ap2=randomUUID();await q("insert into appointments values($1,'confirmed',now(),'admin')",[ap2]);await q("update appointments set status='completed' where id=$1",[ap2]);assert.equal(await count('admin_push_deliveries'),8);
 const claimed=await q('select * from admin_push_claim(8)');assert.equal(claimed.length,8);assert.equal((await q('select * from admin_push_claim(8)')).length,0);
 const finish=async(row,status,error=null)=>(await q('select admin_push_finish($1,$2,$3,$4) ok',[row.id,row.claim_token,status,error]))[0].ok;
 assert.equal(await finish(claimed[0],'SENT'),true);assert.equal(await finish(claimed[0],'SENT'),false);
 assert.equal(await finish(claimed[1],'EXPIRED','expired'),true);assert.equal((await q('select active from admin_push_subscriptions where id=(select subscription_id from admin_push_deliveries where id=$1)',[claimed[1].id]))[0].active,false);
 await q('update admin_push_subscriptions set active=true');
 await finish(claimed[2],'RETRY','provider');assert.equal((await q('select * from admin_push_claim(8)')).length,0);
 await q("update admin_push_deliveries set claimed_at=now()-interval '3 minutes' where status='PROCESSING'");await q('select * from admin_push_claim(8)');assert.equal(Number((await q("select count(*) n from admin_push_deliveries where status='UNKNOWN'"))[0].n),5);
 await q('update admin_push_subscriptions set active=true');await q("update admin_push_deliveries set available_at=now(),attempts=4 where status='RETRY'");const retry=(await q('select * from admin_push_claim(8)'))[0];await finish(retry,'RETRY','provider');assert.equal((await q('select status from admin_push_deliveries where id=$1',[retry.id]))[0].status,'FAILED');
 const test=(await q('select admin_push_test($1,$2) id',[a,s1]))[0].id;assert.ok(test);assert.equal((await q('select admin_push_test($1,$2) id',[a,s1]))[0].id,null);assert.equal((await q('select admin_push_test($1,$2) id',[b,s1]))[0].id,null);
 await q(`update admin_settings set settings_value='{"push":{"newAppointments":false}}'`);const before=await count('admin_push_deliveries');await q("insert into appointments values($1,'confirmed',now(),'customer')",[randomUUID()]);assert.equal(await count('admin_push_deliveries'),before);

 // Event-driven wake-up SQL: no cron schema required, no network or real secrets.
 await db.exec(`create schema vault;create table vault.decrypted_secrets(name text,decrypted_secret text);
 create schema net;create table net.requests(id bigint generated always as identity,url text,headers jsonb);
 create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language sql as 'insert into net.requests(url,headers) values(url,headers) returning id';`);
 await db.exec(fs.readFileSync('supabase/admin-push-scheduler.sql','utf8'));
 await q('select admin_push_wake()');assert.equal(Number((await q('select count(*) n from net.requests'))[0].n),0);
 await q('insert into vault.decrypted_secrets values($1,$2),($3,$4)',['admin_push_url','https://1200hairstudio.ch/api/internal/admin-push','admin_push_job_secret','synthetic-job-secret-only-32-characters']);
 await q('select admin_push_wake()');assert.equal(Number((await q('select count(*) n from net.requests'))[0].n),1);
 await db.exec('begin');await q('select admin_push_wake()');await db.exec('rollback');assert.equal(Number((await q('select count(*) n from net.requests'))[0].n),1);
 await q("update vault.decrypted_secrets set decrypted_secret='https://evil.invalid' where name='admin_push_url'");await q('select admin_push_wake()');assert.equal(Number((await q('select count(*) n from net.requests'))[0].n),1);

 // Reapply without cron, then simulate an existing legacy job. Only our job is removed.
 const wakeSql=fs.readFileSync('supabase/admin-push-scheduler.sql','utf8');
 assert(!/cron\.schedule\s*\(/i.test(wakeSql));
 await db.exec(wakeSql);
 await db.exec(`create schema cron;create table cron.job(jobid bigint primary key,jobname text);
 insert into cron.job values(1,'1200-admin-push'),(2,'unrelated-job');
 create function cron.unschedule(bigint) returns boolean language sql as 'with removed as (delete from cron.job where jobid=$1 returning jobid) select exists(select 1 from removed)';`);
 await db.exec(wakeSql);assert.deepEqual((await q('select jobname from cron.job')).map(row=>row.jobname),['unrelated-job']);
 // Real delivery INSERT invokes the stub once for all devices, with transactional rollback.
 await q("update vault.decrypted_secrets set decrypted_secret='https://1200hairstudio.ch/api/internal/admin-push' where name='admin_push_url'");
 await q("update admin_settings set settings_value='{}'");
 const requests=async()=>Number((await q('select count(*) n from net.requests'))[0].n);
 let requestsBefore=await requests();
 await q("insert into appointments values($1,'confirmed',now(),'customer')",[randomUUID()]);assert.equal(await requests(),requestsBefore+1);
 requestsBefore=await requests();await db.exec('begin');await q("insert into appointments values($1,'confirmed',now(),'customer')",[randomUUID()]);await db.exec('rollback');assert.equal(await requests(),requestsBefore);
 const registered=randomUUID();await q('insert into auth.users values($1,null)',[registered]);await q("insert into profiles values($1,'customer')",[registered]);assert.equal(await requests(),requestsBefore);
 await q('update auth.users set email_confirmed_at=now() where id=$1',[registered]);assert.equal(await requests(),requestsBefore+1);
 await q('update auth.users set email_confirmed_at=now() where id=$1',[registered]);assert.equal(await requests(),requestsBefore+1);
 // A pg_net enqueue failure never aborts appointment or completed-registration persistence.
 await db.exec("create or replace function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language plpgsql as $$ begin raise exception 'synthetic enqueue failure';end $$;");
 const unaffected=randomUUID();await q("insert into appointments values($1,'confirmed',now(),'customer')",[unaffected]);assert.equal((await q('select status from appointments where id=$1',[unaffected]))[0].status,'confirmed');
 const another=randomUUID();await q('insert into auth.users values($1,null)',[another]);await q("insert into profiles values($1,'customer')",[another]);await q('update auth.users set email_confirmed_at=now() where id=$1',[another]);assert.ok((await q('select email_confirmed_at from auth.users where id=$1',[another]))[0].email_confirmed_at);
 assert.ok(Number((await q("select count(*) n from admin_push_deliveries where status='PENDING'"))[0].n)>0,'Missed wake-ups retain pending diagnostic records');
 await db.close();console.log('PASS isolated PostgreSQL: migration, RLS grants, admin ownership, multiple devices, verified registration, transaction rollback, booking/completion preferences, idempotent claims/results, expired subscriptions, bounded retries, ambiguous leases, own-device test rate limit, event-driven wake-ups, rollback, nonblocking failure, no cron dependency and targeted legacy-job cleanup.');
})().catch(error=>{console.error(error);process.exitCode=1;});
