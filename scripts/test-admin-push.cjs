const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
function load(file,mocks={}){const module={exports:{}};const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;new Function('require','module','exports',source)(name=>name==='server-only'?{}:Object.hasOwn(mocks,name)?mocks[name]:require(name),module,module.exports);return module.exports;}
const keys=require('web-push').generateVAPIDKeys();Object.assign(process.env,{NEXT_PUBLIC_VAPID_PUBLIC_KEY:keys.publicKey,VAPID_PRIVATE_KEY:keys.privateKey,VAPID_SUBJECT:'mailto:test@example.invalid'});
let sends=0,failure=null;
const provider=load('src/lib/push/provider.ts',{'web-push':{sendNotification:async()=>{sends++;if(failure)throw failure;}}});
const prefs=load('src/lib/push/preferences.ts');
const id='11111111-1111-4111-8111-111111111111';
const sub={endpoint:'https://fcm.googleapis.com/test',p256dh:keys.publicKey,auth_key:Buffer.alloc(16).toString('base64url'),vapid_public_key:keys.publicKey};
(async()=>{
 assert.ok(provider.pushConfigured());process.env.VAPID_PRIVATE_KEY='bad';assert.equal(provider.pushConfigured(),false);process.env.VAPID_PRIVATE_KEY=keys.privateKey;
 for(const endpoint of ['http://fcm.googleapis.com/x','https://localhost/x','https://fcm.googleapis.com.evil.invalid/x','https://user:pass@fcm.googleapis.com/x'])assert.throws(()=>provider.validateSubscription({endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth_key}}));
 assert.equal((await provider.sendWebPush(sub,{})).status,'SENT');
 for(const [statusCode,status] of [[404,'EXPIRED'],[410,'EXPIRED'],[429,'RETRY'],[503,'RETRY'],[401,'FAILED'],[400,'FAILED']]){failure={statusCode};assert.equal((await provider.sendWebPush(sub,{})).status,status);}
 failure=new Error('synthetic-private-provider-detail');assert.equal((await provider.sendWebPush(sub,{})).status,'UNKNOWN');
 let user={id},role='admin',configured=true,rpcs=[],updates=[];
 const query={select(){return this;},eq(k,v){updates.push([k,v]);return this;},update(){return this;},then(resolve){return Promise.resolve({data:[],error:null}).then(resolve);}};
 const api=load('src/lib/push/api.ts',{'@/lib/auth/customer':{getCurrentUserRole:async()=>({user,role})},'@/lib/supabase/admin':{createAdminClient:()=>({from:()=>query,rpc:async(name,args)=>{rpcs.push([name,args]);return{data:id,error:null};}})},'@/lib/logging':{safeLogDetails:()=>({})},'./preferences':prefs,'./provider':{...provider,pushConfigured:()=>configured},'./worker':{processAdminPush:async target=>{assert.equal(target,id);return{accepted:1};}}});
 const request=(body={},headers={})=>new Request('https://example.invalid/api/admin/push/subscriptions',{method:'POST',headers:{'content-type':'application/json','x-admin-push':'1',origin:'https://example.invalid',...headers},body:JSON.stringify(body)});
 user=null;assert.equal((await api.handlePushApi(request(),'subscribe')).status,401);user={id};role='customer';assert.equal((await api.handlePushApi(request(),'subscribe')).status,403);role='admin';
 assert.equal((await api.handlePushApi(request({}, {origin:'https://evil.invalid'}),'subscribe')).status,403);
 configured=false;assert.equal((await api.handlePushApi(request(),'subscribe')).status,503);configured=true;
 assert.equal((await api.handlePushApi(request({subscription:{endpoint:'https://localhost'},locale:'en'}),'subscribe')).status,400);
 assert.equal((await api.handlePushApi(request({subscription:{endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth_key}},locale:'de'}),'subscribe')).status,200);assert.equal(rpcs.at(-1)[1].p_admin,id);
 assert.equal((await api.handlePushApi(request({id}),'unsubscribe')).status,200);assert.ok(updates.some(([key,value])=>key==='admin_user_id'&&value===id));
 assert.equal((await api.handlePushApi(request({id}),'test')).status,202);assert.equal(rpcs.at(-1)[0],'admin_push_test');

 const job=load('src/app/api/internal/admin-push/route.ts',{'@/lib/push/worker':{processAdminPush:async()=>({processed:0})},'@/lib/logging':{safeLogDetails:()=>({})}});
 process.env.ADMIN_PUSH_JOB_SECRET='synthetic-secret-with-more-than-32-characters';
 assert.equal((await job.POST(new Request('https://example.invalid/api/internal/admin-push',{method:'POST'}))).status,401);
 assert.equal((await job.POST(new Request('https://example.invalid/api/internal/admin-push',{method:'POST',headers:{authorization:'Bearer '+process.env.ADMIN_PUSH_JOB_SECRET}}))).status,200);
 let event={kind:'appointment_confirmed',entity_id:id};
 const relay=load('src/app/admin/push/[eventId]/page.tsx',{'@/i18n/server':{redirect:async path=>{throw new Error(path);}},'@/lib/auth/customer':{getCurrentUserRole:async()=>({user,role})},'@/lib/push/preferences':prefs,'@/lib/appointments/date-utils':{getZurichDateKeyFromIso:()=> '2026-07-01'},'@/lib/supabase/admin':{createAdminClient:()=>({from:table=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:table==='admin_push_events'?event:{id,start_at:'2026-07-01T12:30:00Z'}})})})}}).default;
 user=null;await assert.rejects(relay({params:Promise.resolve({eventId:id})}),e=>e.message===`/admin/login?push=${id}`);user={id};role='customer';await assert.rejects(relay({params:Promise.resolve({eventId:id})}),e=>e.message==='/account');role='admin';await assert.rejects(relay({params:Promise.resolve({eventId:id})}),e=>e.message.includes('/admin/appointments?view=day&date=2026-07-01&appointmentId='));
 event={kind:'customer_registered',entity_id:id};await assert.rejects(relay({params:Promise.resolve({eventId:id})}),e=>e.message===`/admin/customers?customerId=${id}`);
 const worker=load('src/lib/push/worker.ts',{'next-intl':require('next-intl'),'../../../messages/en.json':require('../messages/en.json'),'../../../messages/de.json':require('../messages/de.json'),'@/lib/supabase/admin':{},'@/lib/logging':{},'./provider':provider});
 for(const locale of ['en','de']){const payload=worker.pushPayload({event_id:id,kind:'appointment_confirmed',starts_at:'2026-07-01T12:30:00Z',locale});assert.ok(payload.body.includes('14:30'));assert.equal(payload.url,`/${locale}/admin/push/${id}`);assert.deepEqual(Object.keys(payload).sort(),['body','id','title','url']);}
 const details=require('web-push').generateRequestDetails({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth_key}},JSON.stringify({title:'Synthetic'}),{vapidDetails:{subject:process.env.VAPID_SUBJECT,publicKey:keys.publicKey,privateKey:keys.privateKey}});assert.ok(details.headers['Content-Encoding']);assert.ok(details.body.length>0);
 const handlers={},shown=[],opened=[];const context={URL,self:{location:{origin:'https://example.invalid'},addEventListener:(name,fn)=>handlers[name]=fn,registration:{showNotification:async(...args)=>shown.push(args)},clients:{matchAll:async()=>[],openWindow:async url=>opened.push(url)}}};vm.runInNewContext(fs.readFileSync('public/sw.js','utf8'),context);
 let pending;handlers.push({data:{json:()=>({id,title:'Test',body:'Safe',url:`/en/admin/push/${id}`})},waitUntil:p=>pending=p});await pending;assert.equal(shown[0][1].tag,`1200-admin-${id}`);assert.equal(shown[0][1].renotify,false);
 handlers.notificationclick({notification:{close(){},data:{url:'https://evil.invalid'}},waitUntil:p=>pending=p});await pending;assert.equal(opened[0],'https://example.invalid/admin');assert.equal(handlers.fetch,undefined);
 console.log('PASS push provider, validated configuration, SSRF rejection, failures, admin API authorization/CSRF/ownership, own-device test, localized private payloads, Zurich timezone, service-worker display/click safety.');
})().catch(error=>{console.error(error);process.exitCode=1;});
