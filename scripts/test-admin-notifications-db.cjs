// Actual SQL in isolated PostgreSQL only; no project credentials, records or sends.
const assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
(async()=>{
 const db=new PGlite();const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create table auth.users(id uuid primary key,email_confirmed_at timestamptz);create table profiles(id uuid primary key,role text);
 create table admin_settings(settings_key text primary key,settings_value jsonb);
 create table appointments(id uuid primary key,status text,start_at timestamptz,booking_source text);`);
 await db.exec(fs.readFileSync('supabase/migrations/202611250001_admin_web_push.sql','utf8'));
 const migration=fs.readFileSync('supabase/migrations/202611250002_admin_notification_inbox.sql','utf8');await db.exec(migration);await db.exec(migration);
 const a=randomUUID(),b=randomUUID(),customer=randomUUID();await q("insert into profiles values($1,'admin'),($2,'admin')",[a,b]);
 const count=async()=>(await q('select count(*)::integer n from admin_notifications'))[0].n;
 // No device subscriptions. Disabled push preferences must not disable the inbox.
 await db.exec(`insert into admin_settings values('notifications','{"push":{"newCustomers":false,"newAppointments":false,"completed":false}}')`);
 await q('insert into auth.users values($1,null)',[customer]);await q("insert into profiles values($1,'customer')",[customer]);assert.equal(await count(),0);
 await q('update auth.users set email_confirmed_at=now() where id=$1',[customer]);assert.equal(await count(),2);
 await q('update auth.users set email_confirmed_at=now() where id=$1',[customer]);assert.equal(await count(),2);
 const appointment=randomUUID();await q("insert into appointments values($1,'confirmed',now(),'customer')",[appointment]);assert.equal(await count(),4);
 await q("update appointments set status='confirmed' where id=$1",[appointment]);assert.equal(await count(),4);
 await q("update appointments set status='completed' where id=$1",[appointment]);assert.equal(await count(),6);
 await q("update appointments set status='completed' where id=$1",[appointment]);assert.equal(await count(),6);
 await q("insert into admin_push_events(event_key,kind,entity_id) values('test:synthetic','test',$1)",[a]);assert.equal(await count(),6);
 await q("insert into appointments values($1,'confirmed',now(),'admin')",[randomUUID()]);assert.equal(await count(),8);
 await db.exec('begin');await q("insert into appointments values($1,'confirmed',now(),'customer')",[randomUUID()]);await db.exec('rollback');assert.equal(await count(),8);
 const own=(await q('select * from admin_notifications where admin_user_id=$1 order by created_at desc,id desc',[a]));assert.equal(own.length,4);
 await q('update admin_notifications set read_at=now() where id=$1 and admin_user_id=$2',[own[0].id,b]);assert.equal((await q('select read_at from admin_notifications where id=$1',[own[0].id]))[0].read_at,null);
 await q('update admin_notifications set read_at=now() where id=$1 and admin_user_id=$2',[own[0].id,a]);assert.ok((await q('select read_at from admin_notifications where id=$1',[own[0].id]))[0].read_at);
 await q('update admin_notifications set read_at=null where id=$1 and admin_user_id=$2',[own[0].id,a]);assert.equal((await q('select read_at from admin_notifications where id=$1',[own[0].id]))[0].read_at,null);
 await q('update admin_notifications set read_at=now() where admin_user_id=$1',[a]);assert.equal((await q('select count(*)::integer n from admin_notifications where admin_user_id=$1 and read_at is null',[b]))[0].n,4);
 // Event retention never deletes inbox records or removes their entity navigation data.
 await db.exec('delete from admin_push_events');assert.equal(await count(),8);assert.equal((await q('select count(*)::integer n from admin_notifications where event_id is null'))[0].n,8);assert.ok((await q('select entity_id from admin_notifications limit 1'))[0].entity_id);
 for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);await assert.rejects(q('select * from admin_notifications'));await assert.rejects(q('update admin_notifications set read_at=now()'));await assert.rejects(q('select admin_notification_event_created()'));await db.exec('reset role');}
 // New arrivals between pages do not shift a timestamp/UUID keyset cursor.
 const ids=[];for(let i=0;i<35;i++){const id=randomUUID();ids.push(id);await q("insert into admin_notifications(id,admin_user_id,kind,created_at) values($1,$2,'appointment_confirmed','2026-11-25T09:00:00.123456Z')",[id,a]);}
 const first=await q('select id,created_at::text from admin_notifications where admin_user_id=$1 order by created_at desc,id desc limit 15',[a]);const last=first.at(-1);
 await q("insert into admin_notifications(admin_user_id,kind,created_at) values($1,'appointment_confirmed','2099-01-01')",[a]);
 const next=await q('select id from admin_notifications where admin_user_id=$1 and (created_at,id)<($2::timestamptz,$3::uuid) order by created_at desc,id desc limit 15',[a,last.created_at,last.id]);assert.equal(next.length,15);assert.equal(next.filter(row=>first.some(old=>old.id===row.id)).length,0);
 // Inbox insert failures are caught; persisted registrations/appointments still succeed.
 await db.exec(`create function public.synthetic_inbox_failure() returns trigger language plpgsql as $$begin raise exception 'synthetic failure';end$$;
 create trigger synthetic_failure before insert on admin_notifications for each row execute function public.synthetic_inbox_failure();`);
 const unaffected=randomUUID();await q("insert into appointments values($1,'confirmed',now(),'customer')",[unaffected]);assert.equal((await q('select status from appointments where id=$1',[unaffected]))[0].status,'confirmed');
 const other=randomUUID();await q('insert into auth.users values($1,null)',[other]);await q("insert into profiles values($1,'customer')",[other]);await q('update auth.users set email_confirmed_at=now() where id=$1',[other]);assert.ok((await q('select email_confirmed_at from auth.users where id=$1',[other]))[0].email_confirmed_at);
 await db.close();console.log('PASS isolated inbox SQL: reconciliation replay, confirmed registration/booking/completion, duplicate/test exclusion, no-device/disabled-push independence, per-admin read state, cursor arrivals, retention, grants and nonblocking failures.');
})().catch(error=>{console.error(error);process.exitCode=1;});
