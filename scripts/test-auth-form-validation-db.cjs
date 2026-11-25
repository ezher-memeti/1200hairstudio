// Isolated PostgreSQL only. Never loads Supabase credentials or sends email.
const assert=require('node:assert/strict'),fs=require('node:fs'),{createHash}=require('node:crypto');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
(async()=>{const db=new PGlite();const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create table auth.users(id uuid primary key default gen_random_uuid(),email text,deleted_at timestamptz);
 insert into auth.users(email) values('EXISTING@example.invalid'),('unconfirmed@example.invalid');insert into auth.users(email,deleted_at) values('deleted@example.invalid',now());`);
 await db.exec(fs.readFileSync('supabase/migrations/202611250003_auth_form_validation.sql','utf8'));
 for(const [email,expected]of [[' existing@EXAMPLE.invalid ',true],['unconfirmed@example.invalid',true],['nonexistent@example.invalid',false],['deleted@example.invalid',false]])assert.equal((await q('select auth_form_account_exists($1) value',[email]))[0].value,expected);
 for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);await assert.rejects(q('select auth_form_account_exists($1)',['existing@example.invalid']));await assert.rejects(q('select * from auth_form_limits'));await assert.rejects(q('select consume_auth_form_budget($1,$2,$3)',['register','a'.repeat(64),'b'.repeat(64)]));await db.exec('reset role');}
 const hash=s=>createHash('sha256').update(s).digest('hex');const consume=async(action,client,email)=>(await q('select consume_auth_form_budget($1,$2,$3) wait',[action,hash(client),hash(email)]))[0].wait;
 for(let i=0;i<3;i++)assert.equal(await consume('register','client-a','email-a'),0);assert.ok(await consume('register','client-b','email-a')>0,'email limit spans IPs');
 assert.equal(await consume('forgot-password','client-a','email-a'),0,'operation budgets independent');
 await db.exec('truncate auth_form_limits');for(let i=0;i<10;i++)assert.equal(await consume('register','same-client','email-'+i),0);assert.ok(await consume('register','same-client','email-next')>0);
 await db.exec('truncate auth_form_limits');for(let i=0;i<100;i++)assert.equal(await consume('register','client-'+i,'email-'+i),0);assert.ok(await consume('register','another-client','another-email')>0);
 await db.exec("update auth_form_limits set expires_at=now()-interval '1 second'");assert.equal(await consume('register','another-client','another-email'),0);
 const keys=await q('select key from auth_form_limits');assert(keys.every(row=>!row.key.includes('@')&&!row.key.includes('client-a')));
 await assert.rejects(q('select consume_auth_form_budget($1,$2,$3)',['register','bad','bad']));await assert.rejects(q('select consume_auth_form_budget($1,$2,$3)',[null,hash('ip'),hash('mail')]));
 await db.exec('set role service_role');assert.equal((await q('select auth_form_account_exists($1) value',['existing@example.invalid']))[0].value,true);await assert.rejects(q("select consume_auth_form_bucket('bypass',100)"));await db.exec('reset role');
 await db.close();console.log('PASS isolated auth SQL: real auth.users truth including unconfirmed/soft-deleted accounts, case normalization, no browser-role lookup/table grants, service-only RPC, per-email/client/global shared budgets, separate operations and expiry cleanup.');
})().catch(error=>{console.error(error);process.exitCode=1;});
