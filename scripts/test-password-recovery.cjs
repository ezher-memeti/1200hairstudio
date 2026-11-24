// Synthetic auth only: never calls Supabase or changes an account.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file, mocks={}) {
  const module = {exports:{}};
  const code = ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','module','exports',code)(name=>Object.hasOwn(mocks,name)?mocks[name]:name.startsWith('@/')?load('src/'+name.slice(2)+'.ts',mocks):require(name),module,module.exports);
  return module.exports;
}
const {observePasswordRecovery,cleanRecoveryUrl}=load('src/lib/auth/recovery.ts');
const session={user:{id:'synthetic-user'}};
function fixture(suffix='?code=synthetic') {
  let listener, resolve, reject, unsubscribed=false, cleared=0;
  const pending=new Promise((a,b)=>{resolve=a;reject=b});
  const states=[];
  const auth={onAuthStateChange(callback){listener=callback;return {data:{subscription:{unsubscribe(){unsubscribed=true}}}}},getSession(){assert(listener,'subscribe before session lookup');return pending}};
  const cleanup=observePasswordRecovery(auth,new URL('https://1200hairstudio.ch/en/reset-password'+suffix),state=>states.push(state),()=>cleared++);
  return {states,cleanup,emit:(event,s=session)=>listener(event,s),resolve:(s=session,error=null)=>resolve({data:{session:s},error}),reject:()=>reject(Error('synthetic')),unsubscribed:()=>unsubscribed,cleared:()=>cleared};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
  for(const fail of [false,true]) {
    const f=fixture();f.emit('PASSWORD_RECOVERY');if(fail)f.reject();else f.resolve();await flush();
    assert.deepEqual(f.states,['ready'],'session completion cannot overwrite verified recovery');f.cleanup();
  }
  for(const suffix of ['', '?type=recovery', '?code=synthetic-invalid', '#error=access_denied&error_code=otp_expired', '?error_code=otp_expired']) {
    const f=fixture(suffix);f.emit('SIGNED_IN');f.resolve();await flush();assert.deepEqual(f.states,['invalid']);f.cleanup();
  }
  for(const suffix of ['?error=access_denied','#error_code=otp_expired']) {
    const f=fixture(suffix);f.emit('PASSWORD_RECOVERY');f.resolve();await flush();assert.deepEqual(f.states,['invalid']);f.cleanup();
  }
  const implicit=fixture('#type=recovery&access_token=synthetic');implicit.resolve();await flush();assert.deepEqual(implicit.states,['ready']);implicit.cleanup();
  const missing=fixture();missing.resolve(null);await flush();assert.deepEqual(missing.states,['invalid']);missing.cleanup();
  const unmounted=fixture();unmounted.cleanup();unmounted.emit('PASSWORD_RECOVERY');unmounted.resolve();await flush();assert.deepEqual(unmounted.states,[]);assert(unmounted.unsubscribed());
  const late=fixture();late.resolve(null);await flush();late.emit('PASSWORD_RECOVERY');assert.deepEqual(late.states,['invalid','ready']);late.emit('SIGNED_OUT',null);assert.equal(late.states.at(-1),'invalid');late.cleanup();
  assert.equal(cleanRecoveryUrl(new URL('https://1200hairstudio.ch/de/reset-password?code=synthetic&type=recovery&error_description=private&flow_id=synthetic#access_token=synthetic')),'/de/reset-password');
  // No next/redirect parameter is ever used as a navigation target.
  assert.equal(new URL('https://1200hairstudio.ch'+cleanRecoveryUrl(new URL('https://1200hairstudio.ch/en/reset-password?next=https://evil.invalid'))).origin,'https://1200hairstudio.ch');
  const old=process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_SITE_URL='https://1200hairstudio.ch/';
  const {getResetPasswordRedirectUrl}=load('src/lib/auth/url.ts');
  for(const locale of ['de','en'])assert.equal(getResetPasswordRedirectUrl(locale),`https://1200hairstudio.ch/${locale}/reset-password`);
  assert.equal(getResetPasswordRedirectUrl('//evil.invalid'),'https://1200hairstudio.ch/de/reset-password');
  if(old===undefined)delete process.env.NEXT_PUBLIC_SITE_URL;else process.env.NEXT_PUBLIC_SITE_URL=old;
  const config=fs.readFileSync(path.join(root,'supabase/config.toml'),'utf8');
  const redirects=JSON.parse(config.match(/^additional_redirect_urls = (.+)$/m)[1]);
  for(const hostname of ['localhost','127.0.0.1'])for(const locale of ['de','en'])assert(redirects.includes(`http://${hostname}:3000/${locale}/reset-password`));
  for(const locale of ['de','en']){
    const messages=require(`../messages/${locale}.json`).ui;
    assert(messages.m7d1e596bfc26);assert(messages.m7e33bf6bb1fb);
  }
  const {NextRequest,NextResponse}=require('next/server');
  const originalMode=process.env.APP_SITE_MODE;
  try {
    const {middleware}=load('src/middleware.ts',{'server-only':{},'@/lib/supabase/middleware':{updateSession:async(_request,response)=>response??NextResponse.next()}});
    for(const mode of ['live','coming_soon','under_construction'])for(const locale of ['de','en']) {
      process.env.APP_SITE_MODE=mode;
      const response=await middleware(new NextRequest(`https://1200hairstudio.ch/${locale}/reset-password?code=synthetic`));
      assert.equal(response.status,200);
      assert.equal(response.headers.get('location'),null);
      assert.equal(response.headers.get('x-middleware-rewrite'),'https://1200hairstudio.ch/reset-password?code=synthetic');
    }
  } finally {if(originalMode===undefined)delete process.env.APP_SITE_MODE;else process.env.APP_SITE_MODE=originalMode;}
  console.log('PASS recovery event race, invalid/expired/reused and missing-session states, implicit compatibility, unsubscribe, sign-out, URL cleanup and canonical localized destinations. Mocked auth only.');
})().catch(error=>{console.error(error);process.exitCode=1});
