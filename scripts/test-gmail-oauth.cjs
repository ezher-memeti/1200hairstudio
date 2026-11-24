// Actual Google OAuth2 implementation with a mocked transporter. No external requests or mail.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const path=require('node:path');
const {google}=require('googleapis');
const root=path.resolve(__dirname,'..');
const secret='synthetic-private-value';
const envNames=['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GOOGLE_REFRESH_TOKEN'];
const previous=Object.fromEntries(envNames.map(key=>[key,process.env[key]]));
let mode='success',refreshes=0,sends=0,client;
const logs=[];const originalError=console.error;
console.error=(...args)=>logs.push(JSON.stringify(args));
class OAuth2 extends google.auth.OAuth2 {
 constructor(id,clientSecret){
  assert.equal(id,'synthetic-client');assert.equal(clientSecret,secret);super(id,clientSecret);client=this;
  this.transporter.request=async options=>{
   refreshes++;assert.equal(String(options.url),'https://oauth2.googleapis.com/token');
   assert.equal(new URLSearchParams(options.data).get('refresh_token'),secret);
   if(mode==='invalid_grant'||mode==='invalid_client')throw Object.assign(new Error(secret),{response:{status:400,data:{error:mode,error_description:secret}},config:{secret}});
   return {data:{access_token:'synthetic-access',expires_in:3600,token_type:'Bearer'},status:200};
  };
 }
}
function load(){
 const module={exports:{}};
 const source=ts.transpileModule(fs.readFileSync(path.join(root,'src/lib/email/gmail.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const safeModule={exports:{}};
 new Function('module','exports',ts.transpileModule(fs.readFileSync(path.join(root,'src/lib/logging.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(safeModule,safeModule.exports);
 const mocks={'@/lib/logging':safeModule.exports,googleapis:{google:{auth:{OAuth2},gmail:({auth})=>({users:{messages:{send:async()=>{
  const headers=await auth.getRequestHeaders('https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
  assert.equal(headers.get('authorization'),'Bearer synthetic-access');sends++;
  if(mode==='permission')throw {response:{status:403,data:{error:{errors:[{reason:'insufficientPermissions'}],message:secret}}},config:{secret}};
  return {data:{id:'synthetic-message'}};
 }}}})}},'@/lib/admin/runtime-settings':{getRuntimeSettings:async()=>({notifications:{senderName:'Studio'},business:{businessName:'Studio'}})}};
 new Function('require','module','exports',source)(name=>Object.hasOwn(mocks,name)?mocks[name]:name==='server-only'||name.startsWith('@/')?{}:require(name),module,module.exports);
 return module.exports;
}
(async()=>{
 for(const key of envNames)process.env[key]=` ${key==='GOOGLE_CLIENT_ID'?'synthetic-client':secret}\n`;
 const {sendGmailMessage,sanitizeGmailError}=load();
 const message={to:'synthetic@example.invalid',subject:'Synthetic',html:'Synthetic',text:'Synthetic'};
 assert.deepEqual(await sendGmailMessage(message),{providerMessageId:'synthetic-message'});
 assert.equal(refreshes,1);assert.equal(sends,1);assert.equal(process.env.GOOGLE_REFRESH_TOKEN,` ${secret}\n`);
 await client.getRequestHeaders();assert.equal(refreshes,1,'valid access token reused by official client');
 client.credentials.expiry_date=Date.now()-1000;await client.getRequestHeaders();assert.equal(refreshes,2,'expired access token automatically refreshed');
 for(mode of ['invalid_grant','invalid_client'])await assert.rejects(sendGmailMessage(message),error=>error.code===mode&&!JSON.stringify(error).includes(secret)&&!error.message.includes(secret));
 mode='permission';await assert.rejects(sendGmailMessage(message),error=>error.code==='gmail_permission_denied'&&error.status===403);
 for(const key of envNames){const saved=process.env[key];process.env[key]='  ';await assert.rejects(sendGmailMessage(message),error=>error.code==='gmail_configuration_missing');process.env[key]=saved;}
 for(const [status,reason,code] of [[403,'accessNotConfigured','gmail_api_disabled'],[403,'rateLimitExceeded','gmail_rate_limited'],[429,'unknown','gmail_rate_limited'],[401,'unknown','gmail_authentication_failed'],[500,'unknown','gmail_delivery_failed']]){
  const error=sanitizeGmailError({code:secret,message:secret,response:{status,data:{error:{errors:[{reason}],message:secret}}}});assert.equal(error.code,code);assert(!JSON.stringify(error).includes(secret));assert(!error.message.includes(secret));
 }
 assert(!logs.join('').includes(secret));assert(!logs.join('').includes('synthetic@example.invalid'));
 const source=fs.readFileSync(path.join(root,'src/lib/email/gmail.ts'),'utf8');
 assert(!/node:fs|readFile|homedir|gmail-refresh-token\.json/.test(source));
 for(const file of ['src/lib/email/marketing/index.ts','src/lib/email/reminder.ts','src/lib/email/receipt.ts','src/lib/email/recurring.ts','src/lib/email/transactional/index.ts'])assert(fs.readFileSync(path.join(root,file),'utf8').includes('gmail'));
 console.log('PASS official OAuth2 automatic refresh/reuse, expired access token, invalid/revoked refresh grant, invalid client, missing credentials, permissions, quotas, sanitized diagnostics and shared filesystem-free sender. No emails or real OAuth requests.');
})().catch(error=>{originalError(error);process.exitCode=1}).finally(()=>{console.error=originalError;for(const key of envNames){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}});
