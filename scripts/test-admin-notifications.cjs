const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(file,mocks={}){const module={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(name=>name==='server-only'?{}:Object.hasOwn(mocks,name)?mocks[name]:name.startsWith('@/')?load('src/'+name.slice(2)+'.ts',mocks):require(name),module,module.exports);return module.exports;}
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333';
let user={id:a},role='admin',calls=[],queryResults=[],dbError=null;
const db={from(table){const call={table,ops:[]};calls.push(call);const query={};for(const name of ['select','eq','is','lte','order','limit','or','update','maybeSingle'])query[name]=(...args)=>{call.ops.push([name,...args]);return query;};query.then=resolve=>Promise.resolve(queryResults.shift()||{data:[],count:0,error:dbError}).then(resolve);return query;}};
const prefs=load('src/lib/push/preferences.ts');
const date=load('src/lib/appointments/date-utils.ts');
const server=load('src/lib/notifications/server.ts',{'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/auth/customer':{getCurrentUserRole:async()=>({user,role})},'@/lib/logging':{safeLogDetails:()=>({})},'@/lib/push/preferences':prefs,'@/lib/appointments/date-utils':date});
const req=(body={},method='PATCH',headers={})=>new Request('https://example.invalid/api/admin/notifications/'+id,{method,headers:{'Content-Type':'application/json','x-admin-notifications':'1',origin:'https://example.invalid',...headers},body:JSON.stringify(body)});
const get=query=>new Request('https://example.invalid/api/admin/notifications'+query);
const row={id,kind:'appointment_confirmed',entity_id:b,starts_at:'2026-12-04T14:30:00Z',booking_source:'customer',created_at:'2026-11-25T09:00:00.123456+00:00',read_at:null};
(async()=>{
 const originalError=console.error;const logs=[];console.error=(...values)=>logs.push(values);try{
 for(const op of ['list','count','read','read-all','open']){user=null;assert.equal((await server.handleNotifications(get(''),op,id)).status,401);user={id:a};role='customer';assert.equal((await server.handleNotifications(get(''),op,id)).status,403);}role='admin';assert.equal(calls.length,0);
 for(const query of ['?cursor=bad','?filter=private','?admin_user_id='+b,'?limit=500','?cursor='+Buffer.from(JSON.stringify({id,at:'bad.or.inject'})).toString('base64url')])assert.equal((await server.handleNotifications(get(query),'list')).status,400);
 assert.equal(server.decodeCursor(server.encodeCursor(row)).at,row.created_at);
 const rows=Array.from({length:16},(_,i)=>({...row,id:'00000000-0000-4000-8000-'+String(i).padStart(12,'0')}));queryResults=[{data:rows,error:null}];calls=[];
 const page=await (await server.handleNotifications(get('?filter=unread'),'list')).json();assert.equal(page.items.length,15);assert.ok(page.nextCursor);assert.ok(calls[0].ops.some(x=>x[0]==='limit'&&x[1]===16));assert.ok(calls[0].ops.some(x=>x[0]==='eq'&&x[1]==='admin_user_id'&&x[2]===a));assert.ok(calls[0].ops.some(x=>x[0]==='is'&&x[1]==='read_at'));
 queryResults=[{data:[],error:null}];await server.handleNotifications(get('?cursor='+page.nextCursor),'list');assert.ok(calls.at(-1).ops.some(x=>x[0]==='or'&&x[1].includes('id.lt.')));
 queryResults=[{count:43,error:null}];const count=await(await server.handleNotifications(get('/count'),'count')).json();assert.equal(count.unread,43);assert.ok(calls.at(-1).ops.some(x=>x[0]==='select'&&x[2].head));
 for(const op of ['read','read-all','open'])assert.equal((await server.handleNotifications(req({},'POST',{origin:'https://evil.invalid'}),op,id)).status,403);
 assert.equal((await server.handleNotifications(req({read:true,admin_user_id:b}),'read',id)).status,400);
 queryResults=[{data:{id,read_at:'2026-11-25T12:00:00Z'},error:null}];await server.handleNotifications(req({read:true}),'read',id);assert.ok(calls.at(-1).ops.some(x=>x[0]==='eq'&&x[1]==='admin_user_id'&&x[2]===a));
 queryResults=[{data:null,error:null}];assert.equal((await server.handleNotifications(req({read:false}),'read',id)).status,404);
 calls=[];await server.handleNotifications(req({},'POST'),'read-all');assert.ok(calls[0].ops.some(x=>x[0]==='lte'&&x[1]==='created_at'));assert(!calls[0].ops.some(x=>x[0]==='select'));
 queryResults=[{data:row,error:null},{data:{id:b,start_at:'2026-12-07T09:45:00Z'},error:null},{error:null}];calls=[];
 const opened=await(await server.handleNotifications(req({},'POST'),'open',id)).json();assert.equal(opened.href,`/admin/appointments?view=day&date=2026-12-07&appointmentId=${b}&notification=${id}`);assert.equal(opened.missing,false);assert.ok(calls[0].ops.some(x=>x[0]==='eq'&&x[1]==='admin_user_id'));assert.ok(calls[2].ops.some(x=>x[0]==='is'&&x[1]==='read_at'));
 queryResults=[{data:{id:a,start_at:'2026-01-01T23:30:00Z'},error:null}];const historical=await server.resolveNotificationTarget(db,{...row,kind:'appointment_completed'});assert.ok(historical.href.includes('date=2026-01-02'));
 queryResults=[{data:{id:b},error:null}];assert.equal((await server.resolveNotificationTarget(db,{...row,kind:'customer_registered'})).href,`/admin/customers?customerId=${b}`);assert.ok(calls.at(-1).ops.some(x=>x[0]==='eq'&&x[1]==='profile_id'&&x[2]===b));
 queryResults=[{data:null,error:null}];assert.deepEqual(await server.resolveNotificationTarget(db,row),{href:'/admin/appointments',missing:true});assert.equal((await server.resolveNotificationTarget(db,{...row,entity_id:null})).missing,true);
 queryResults=[{data:null,error:null}];assert.equal((await server.handleNotifications(req({},'POST'),'open',id)).status,404);
 dbError={message:'synthetic private details',code:'42501'};queryResults=[];const failure=await server.handleNotifications(get(''),'list');assert.equal(failure.status,503);assert(!(await failure.text()).includes('synthetic private'));assert(!JSON.stringify(logs).includes('synthetic private'));
 const presentation=load('src/lib/notifications/presentation.ts');assert.equal(presentation.notificationGroup('2026-11-24T23:30:00Z',new Date('2026-11-25T10:00:00Z')),'today');assert.equal(presentation.notificationGroup('2026-11-24T12:00:00Z',new Date('2026-11-25T10:00:00Z')),'yesterday');
 for(const locale of ['en','de']){assert.ok(presentation.appointmentNotificationTime(row,locale).includes('15:30'));const messages=require('../messages/'+locale+'.json').notifications;for(const key of ['heading','markRead','markUnread','appointment_completed_title','missing'])assert.ok(messages[key]);}
 const view=fs.readFileSync('src/components/admin/AdminAppointmentsView.tsx','utf8');assert.ok(view.includes('data-appointment-id={appointment.id}'));assert.ok(view.includes('scrollIntoView'));assert.ok(view.includes('detailHeading.current?.focus'));assert.ok(view.includes('notificationHistory ?'));assert.ok(fs.readFileSync('src/components/admin/AdminCustomersView.tsx','utf8').includes('[initialCustomerId, customers]'));
 console.log('PASS notification APIs: all-operation authorization, owned queries, CSRF/body/cursor validation, microseconds, bounded keyset pages/count, read/unread/all, retained-entity and rescheduled deep links, missing records, sanitized failures, EN/DE Zurich grouping and existing detail reuse.');
 }finally{console.error=originalError;}
})().catch(error=>{console.error(error);process.exitCode=1;});
