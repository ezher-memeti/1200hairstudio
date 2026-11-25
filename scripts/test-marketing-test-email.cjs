const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
function load(file,mocks={}){
 const mod={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',code)(name=>{
  if(Object.hasOwn(mocks,name))return mocks[name];
  if(name==='server-only')return {};
  if(name.startsWith('@/'))return load('src/'+name.slice(2)+'.ts',mocks);
  if(name.endsWith('.json'))return require(path.resolve(root,path.dirname(file),name));
  if(name.startsWith('.'))return load(path.join(path.dirname(file),name+'.ts'),mocks);
  return require(name);
 },mod,mod.exports);return mod.exports;
}
const input={campaignName:'Synthetic campaign',templateId:null,subject:'',preheader:'',headline:'',content:'',ctaText:'',ctaUrl:'',translations:{de:{subject:'Grüsse aus dem Studio',preheader:'Vorschau',headline:'Willkommen',content:'Grüsse und Neuigkeiten.',ctaText:''}}};
const sent=[];let locale='en',authorized=true,providerError=null,recipient='admin@example.invalid';
const logs=[];const original=console.error;console.error=(...args)=>logs.push(JSON.stringify(args));
const actions=load('src/app/admin/(dashboard)/marketing/actions.ts',{
 'next/cache':{revalidatePath(){}},'next-intl/server':{getLocale:async()=>locale,getTranslations:async()=>((key)=>key)},
 '@/lib/auth/customer':{requireAdminUser:async()=>{if(!authorized)throw Error('synthetic auth failure');return {user:{email:recipient}};}},
 '@/lib/email/gmail':{sendGmailMessage:async message=>{if(providerError)throw providerError;sent.push(message);return {providerMessageId:'synthetic'};}},
 '@/lib/email/marketing':{},'@/lib/customers/queries':{},'@/lib/marketing/audience':{},'@/lib/marketing/queries':{},
});
(async()=>{
 const german=await actions.sendMarketingTest(input,'de');
 assert.equal(german.success,true,'German-only draft must reach Gmail rather than failing English-source validation');
 assert.equal(sent.length,1);assert.equal(sent[0].subject,'[TEST] Grüsse aus dem Studio');assert(sent[0].html.includes('Willkommen'));assert(!sent[0].html.includes('undefined'));
 console.log('PASS German-only draft sends selected content independently of interface language');
 const english={...input,subject:'English subject',headline:'Hello',content:'English message'};
 locale='de';assert((await actions.sendMarketingTest(english,'en')).success);assert.equal(sent.at(-1).subject,'[TEST] English subject');
 const before=sent.length;
 assert.equal((await actions.sendMarketingTest({...english,subject:'Subject\r\nBcc: unexpected@example.invalid'},'en')).success,false);
 assert.equal((await actions.sendMarketingTest(input,'en')).success,false);
 assert.equal((await actions.sendMarketingTest({...english,ctaUrl:'https://'},'en')).success,false);
 assert.equal((await actions.sendMarketingTest({...english,ctaUrl:'javascript:alert(1)'},'en')).success,false);
 recipient='bad\r\nBcc: private@example.invalid';assert.equal((await actions.sendMarketingTest(english,'en')).success,false);recipient='admin@example.invalid';
 assert.equal(sent.length,before,'invalid recipient/content cannot reach provider');
 authorized=false;assert.equal((await actions.sendMarketingTest(english,'en')).success,false);authorized=true;
 for(const code of ['gmail_configuration_missing','gmail_permission_denied','gmail_api_disabled']){
  providerError=Object.assign(new Error('private-payload@example.invalid'),{code});
  const response=await actions.sendMarketingTest(english,'en');assert.equal(response.success,false);assert(!response.message.includes('private-payload'));assert(!response.message.includes('could not be sent.'));
 }
 providerError=null;
 assert(!logs.join('').includes('private-payload'));assert(!logs.join('').includes('admin@example.invalid'));
 console.log('PASS English/German subject consistency, field/CTA/recipient validation, admin guard and sanitized actionable provider failures');
 const envKeys=['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GOOGLE_REFRESH_TOKEN'];
 const saved=Object.fromEntries(envKeys.map(key=>[key,process.env[key]]));const mime=[];
 try {
  for(const key of envKeys)process.env[key]='synthetic';
  const gmail=load('src/lib/email/gmail.ts',{
   googleapis:{google:{auth:{OAuth2:class {setCredentials(){}}},gmail:()=>({users:{messages:{send:async request=>{assert.equal(request.userId,'me');assert.match(request.requestBody.raw,/^[A-Za-z0-9_-]+$/);mime.push(Buffer.from(request.requestBody.raw,'base64url').toString('utf8'));return {data:{id:'synthetic'}};}}}})}},
   '@/lib/admin/runtime-settings':{getRuntimeSettings:async()=>({notifications:{senderName:'Studio'},business:{businessName:'Studio'}})},
   '@/lib/appointments/availability':{},'@/lib/public/services':{},'@/lib/supabase/admin':{}
  });
  for(const message of [sent[0],sent[1],{to:'admin@example.invalid',subject:'Booking confirmed',html:'<p>Booking</p>',text:'Booking'}])await gmail.sendGmailMessage(message);
  for(const raw of mime){assert.equal((raw.match(/^From:/gm)||[]).length,1);assert(raw.includes('MIME-Version: 1.0\r\n'));assert(raw.includes('Content-Type: multipart/alternative'));assert(raw.includes('Content-Type: text/plain; charset="UTF-8"'));assert(raw.includes('Content-Type: text/html; charset="UTF-8"'));assert(raw.includes('\r\n\r\n'));}
  assert(mime[0].includes('Subject: [TEST] Grüsse aus dem Studio'));assert(mime[1].includes('Subject: [TEST] English subject'));
 } finally {for(const key of envKeys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}}
 console.log('PASS test and booking-type messages use identical Gmail API/me/MIME/base64url construction with UTF-8 content');
})().catch(error=>{original(error.message);process.exitCode=1}).finally(()=>console.error=original);
