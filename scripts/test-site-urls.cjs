const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
function load(file,mocks={},extra=""){const mod={exports:{}};const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8')+extra,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;new Function('require','module','exports',code)(name=>{if(Object.hasOwn(mocks,name))return mocks[name];if(name==='server-only')return {};if(name==='react')return {...require('react'),cache:fn=>fn};if(name.startsWith('@/'))return load('src/'+name.slice(2)+'.ts',mocks);if(name.endsWith('.json'))return require(path.resolve(root,path.dirname(file),name));if(name.startsWith('.'))return load(path.join(path.dirname(file),name+'.ts'),mocks);return require(name);},mod,mod.exports);return mod.exports;}
const keys=['GOOGLE_CLIENT_SECRET','NODE_ENV','VERCEL_ENV','NEXT_PUBLIC_VERCEL_ENV','NEXT_PUBLIC_SITE_URL','VERCEL_URL','NEXT_PUBLIC_VERCEL_URL','VERCEL_BRANCH_URL','NEXT_PUBLIC_VERCEL_BRANCH_URL'];
const saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
function environment(values,origin){for(const key of keys)delete process.env[key];Object.assign(process.env,values);if(origin)global.window={location:{origin}};else delete global.window;}
const {getSiteUrl,getResetPasswordRedirectUrl,getLocalizedSiteUrl,localizePublicUrl}=load('src/lib/auth/url.ts');
(async()=>{
 for(const bad of [undefined,'http://localhost:3000','https://127.0.0.1:444','https://www.1200hairstudio.ch','http://1200hairstudio.ch','https://evil.invalid/path','https://user:private@evil.invalid','not a url']){
  environment({NODE_ENV:'production',...(bad?{NEXT_PUBLIC_SITE_URL:bad}:{})},'http://localhost:3999');
  assert.equal(getSiteUrl(),'https://1200hairstudio.ch');
  for(const locale of ['de','en']){
   assert.equal(getResetPasswordRedirectUrl(locale),`https://1200hairstudio.ch/${locale}/reset-password`);
   assert.equal(getLocalizedSiteUrl('/login',locale),`https://1200hairstudio.ch/${locale}/login`);
   assert.equal(localizePublicUrl('http://localhost:3000/book?service=synthetic#booking',locale),`https://1200hairstudio.ch/${locale}/book?service=synthetic#booking`);
   assert.equal(localizePublicUrl('https://www.1200hairstudio.ch/de/account',locale),`https://1200hairstudio.ch/${locale}/account`);
  }
 }
 for(const local of ['http://localhost:3999','http://127.0.0.1:4000','http://[::1]:3001']){
  environment({NODE_ENV:'development',NEXT_PUBLIC_SITE_URL:local});assert.equal(getSiteUrl(),local);
  environment({NODE_ENV:'development',NEXT_PUBLIC_SITE_URL:'https://1200hairstudio.ch'},local);assert.equal(getSiteUrl(),local,'browser PKCE stays on initiating local origin');
 }
 for(const bad of ['javascript:alert(1)','https://example.invalid/path','https://example.invalid?token=private','https://example.invalid/#x','https://u:p@example.invalid']){
  environment({NODE_ENV:'development',NEXT_PUBLIC_SITE_URL:bad});assert.equal(getSiteUrl(),'http://localhost:3000');
 }
 for(const browser of [false,true]){
  environment({NODE_ENV:'production',NEXT_PUBLIC_VERCEL_ENV:'preview',NEXT_PUBLIC_VERCEL_URL:'synthetic-studio.vercel.app',NEXT_PUBLIC_SITE_URL:'http://localhost:3000'},browser?'https://synthetic-studio.vercel.app':undefined);
  assert.equal(getSiteUrl(),'https://synthetic-studio.vercel.app');assert.equal(getResetPasswordRedirectUrl('en'),'https://synthetic-studio.vercel.app/en/reset-password');
 }
 environment({NODE_ENV:'production',VERCEL_ENV:'preview',VERCEL_URL:'synthetic-studio.vercel.app',NEXT_PUBLIC_SITE_URL:'https://1200hairstudio.ch'});assert.equal(getSiteUrl(),'https://synthetic-studio.vercel.app');
 environment({NODE_ENV:'production',VERCEL_ENV:'preview',NEXT_PUBLIC_SITE_URL:'https://preview.example.invalid/'});assert.equal(getSiteUrl(),'https://preview.example.invalid');
 environment({NODE_ENV:'production'});
 for(const bad of ['//evil.invalid','/\\evil.invalid','https://u:p@evil.invalid','javascript:alert(1)'])assert.throws(()=>localizePublicUrl(bad,'de'));
 for(const bad of ['//evil.invalid','https://evil.invalid','/\\evil.invalid'])assert.throws(()=>getLocalizedSiteUrl(bad,'en'));
 assert.equal(localizePublicUrl('https://www.linkedin.com/in/synthetic/','en'),'https://www.linkedin.com/in/synthetic/');
 assert.equal(localizePublicUrl('https://example.invalid/offer?campaign=synthetic','en'),'https://example.invalid/offer?campaign=synthetic');
 const {buildMarketingCampaignEmail}=load('src/lib/marketing/email-template.ts');
 for(const locale of ['de','en']){
  const email=buildMarketingCampaignEmail({subject:'Synthetic',headline:'Synthetic',preheader:'',content:'Synthetic',ctaText:'Book',ctaUrl:'https://localhost:3000/#booking'},locale);
  assert(email.html.includes(`https://1200hairstudio.ch/${locale}#booking`));assert(!email.html.includes('localhost'));assert(!email.text.includes('localhost'));
 }
 const {getBookingManagementUrl}=load('src/lib/appointments/management.ts',{'@/lib/supabase/admin':{},'next/headers':{}});
 for(const locale of ['de','en'])assert.equal(getBookingManagementUrl('synthetic-private-token',locale),`https://1200hairstudio.ch/${locale}/booking/manage/synthetic-private-token`);
 // Render real communication templates while replacing only delivery and settings reads.
 for(const locale of ['de','en']){
  const business={businessName:'Studio',addressLine:'Synthetic',postalCode:'0000',city:'Test',region:'',country:'Switzerland'};
  const mocks={'@/i18n/notifications':{getNotificationLocale:async()=>locale},'@/lib/admin/runtime-settings':{getRuntimeSettings:async()=>({business,notifications:{senderName:'Studio'}}),getBusinessSettings:async()=>business}};
  const gmail=load('src/lib/email/gmail.ts',mocks,'\nsendCustomerEmail=async m=>{module.exports.lastMessage=m};sendGmailMessage=async m=>{module.exports.lastMessage=m};');
  const details={to:'synthetic@example.invalid',adminEmail:'synthetic@example.invalid',customerName:'Synthetic',serviceName:'Synthetic',startAt:'2026-12-01T10:00:00Z',endAt:'2026-12-01T10:30:00Z',price:25,manageUrl:'http://localhost:3000/booking/manage/synthetic-private-token?keep=yes'};
  const check=message=>{assert(!/localhost|127\.0\.0\.1/.test(message.html+message.text));for(const match of message.html.matchAll(/href="(https?:[^" ]+)"/g))assert(match[1].startsWith(`https://1200hairstudio.ch/${locale}`));};
  for(const name of ['sendBookingConfirmationEmail','sendBookingUpdateEmail','sendBookingCancellationEmail','sendAdminBookingNotificationEmail']){await gmail[name](details);check(gmail.lastMessage);}
  let message;
  const capture={...mocks,'@/lib/email/gmail':{sendCustomerEmail:async m=>{message=m}}};
  await load('src/lib/email/reminder.ts',capture).sendAppointmentReminderEmail({...details,registeredCustomer:true});check(message);
  const recurring=load('src/lib/email/recurring.ts',capture);
  for(const variant of ['Confirmation','Updated','Removed','Paused','Resumed']){await recurring['sendRecurringBooking'+variant+'Email']({...details,frequency:'weekly',weekday:1,startTime:'10:00',startsOn:'2026-12-01',endsOn:'2026-12-31',reservedCount:2,removedCount:1});check(message);}
  process.env.GOOGLE_CLIENT_SECRET='synthetic-signing-secret';
  await load('src/lib/email/marketing/index.ts',{'../gmail':{sendCustomerEmail:async m=>{message=m}}}).sendMarketingEmail({customer:{id:'synthetic',email:details.to,marketing_email_consent:true,marketing_email_unsubscribed_at:null,preferred_locale:locale},subject:'Synthetic',html:'<p>Synthetic</p>',text:'Synthetic'});check(message);
 }
 const {NextRequest,NextResponse}=require('next/server');
 const {middleware}=load('src/middleware.ts',{'@/lib/supabase/middleware':{updateSession:async(_r,response)=>response??NextResponse.next()}});
 for(const mode of ['live','coming_soon','under_construction']){process.env.APP_SITE_MODE=mode;for(const locale of ['de','en']){
  const response=await middleware(new NextRequest('http://localhost:3000/reset-password',{headers:{host:'evil.invalid',cookie:`1200_locale=${locale}`}}));
  assert.equal(response.headers.get('location'),`https://1200hairstudio.ch/${locale}/reset-password`);
 }}
 environment({NODE_ENV:'production',NEXT_PUBLIC_VERCEL_ENV:'preview',NEXT_PUBLIC_VERCEL_URL:'synthetic-studio.vercel.app'});
 for(const locale of ['de','en']){
  const response=await middleware(new NextRequest('http://localhost:3000/login',{headers:{host:'evil.invalid',cookie:`1200_locale=${locale}`}}));
  assert.equal(response.headers.get('location'),`https://synthetic-studio.vercel.app/${locale}/login`);
 }
 console.log('PASS production/development/Preview/browser origin matrix, safe local/legacy CTA rewriting, locale preservation, external links, invalid origins/open redirects and all-mode canonical middleware redirects. Synthetic only.');
})().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>{delete global.window;for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}delete process.env.APP_SITE_MODE;});
