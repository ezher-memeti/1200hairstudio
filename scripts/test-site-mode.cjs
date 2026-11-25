// Synthetic-only routing and mutation-boundary checks. No DB records or messages.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file, mocks = {}, fallback) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    if (name in mocks) return mocks[name];
    if (name === 'server-only') return {};
    if (fallback && name.startsWith('@/lib/') && !name.startsWith('@/lib/site-mode')) return fallback(name);
    if (name.startsWith('@/')) return load('src/' + name.slice(2) + '.ts', mocks, fallback);
    if (name.endsWith('.json')) return require(path.resolve(root, path.dirname(file), name));
    if (name.startsWith('.')) return load(path.join(path.dirname(file), name + '.ts'), mocks, fallback);
    return require(name);
  }, module, module.exports);
  return module.exports;
}
let passed = 0;
async function test(name, fn) { await fn();passed++;console.log('PASS ' + name); }
const originalMode = process.env.APP_SITE_MODE;
(async () => {
  const { NextRequest, NextResponse } = require('next/server');
  const config = load('src/lib/site-mode.ts');
  await test('Missing configuration defaults live; only explicit supported values are accepted', () => {
    assert.equal(config.parseSiteMode(undefined), 'live');
    for (const mode of ['live', 'coming_soon', 'under_construction']) assert.equal(config.parseSiteMode(mode), mode);
    for (const invalid of ['', 'maintenance', 'LIVE', ' live ']) assert.throws(() => config.parseSiteMode(invalid), /APP_SITE_MODE/);
  });
  await test('Only necessary admin/auth/existing-management paths are exempt; lookalikes are not', () => {
    for (const route of ['/admin','/admin/login','/admin/finance','/account','/dashboard','/login','/register','/reset-password','/forgot-password','/booking/manage/synthetic.signature','/unsubscribe/synthetic.signature']) assert(config.isEssentialSitePath(route), route);
    for (const route of ['/','/book','/privacy','/admin-bypass','/accounting','/booking/manage','/booking/manage/token/extra']) assert(!config.isEssentialSitePath(route), route);
  });
  for (const mode of ['live','coming_soon','under_construction']) {
    process.env.APP_SITE_MODE = mode;
    const calls=[];
    const { middleware } = load('src/middleware.ts', { '@/lib/supabase/middleware': { updateSession: async (request,response) => { calls.push(request.nextUrl.pathname);const result=response??NextResponse.next();result.headers.set('x-test-session','retained');result.cookies.set('synthetic-cookie','synthetic');return result; } } });
    await test(`${mode}: public rewrites, document status, cache/SEO headers and cookie forwarding`, async () => {
      for (const locale of ['de','en']) for (const route of ['/','/book','/privacy','/unknown-public','/coming-soon','/under-construction']) {
        const response = await middleware(new NextRequest(`https://example.invalid/${locale}${route==='/'?'':route}`));
        const expected = mode==='live' ? route : mode==='coming_soon'?'/coming-soon':'/under-construction';
        assert.equal(response.headers.get('x-middleware-rewrite'),`https://example.invalid${expected}`);
        assert.equal(response.status,mode==='under_construction'?503:200);
        assert.equal(response.headers.get('x-middleware-request-x-next-intl-locale'),locale);
        assert(response.cookies.get('synthetic-cookie'));
        if(mode!=='live'){assert.equal(response.headers.get('x-robots-tag'),'noindex, nofollow');assert(response.headers.get('cache-control').includes('no-store'));}
        if(mode==='under_construction')assert.equal(response.headers.get('retry-after'),'300');
      }
      const action = await middleware(new NextRequest('https://example.invalid/en/book',{method:'POST',headers:{'next-action':'synthetic'}}));
      assert.equal(action.status,200,'Server Actions retain their protocol; creation is guarded separately');
    });
    await test(`${mode}: infrastructure bypasses and existing management/admin routes retain security handling`, async () => {
      for (const asset of ['/sw.js','/manifest.webmanifest']) { const beforeAsset=calls.length; const response=await middleware(new NextRequest(`https://example.invalid${asset}`));assert.equal(response.status,200);assert.equal(calls.length,beforeAsset);assert.equal(response.headers.get('x-middleware-rewrite'),null); }
      const before=calls.length;await middleware(new NextRequest('https://example.invalid/api/webhooks/whatsapp'));assert.equal(calls.length,before,'Exact webhook bypass unchanged');
      for(const route of ['/api/google/auth','/api/google/callback','/api/internal/appointment-reminder-email','/api/admin/whatsapp/test','/api/admin/push/subscriptions','/api/internal/admin-push','/api/account/receipts/synthetic','/auth/callback','/_next/image','/images/background-work.webp','/sitemap.xml']){
        const response=await middleware(new NextRequest(`https://example.invalid${route}`));assert.equal(response.status,200);assert.equal(response.headers.get('x-test-session'),'retained');assert.equal(response.headers.get('x-middleware-rewrite'),null);
      }
      for(const route of ['/admin','/admin/login','/admin/site-settings/notifications','/admin/push/11111111-1111-4111-8111-111111111111','/account','/login','/reset-password','/booking/manage/synthetic.signature','/unsubscribe/synthetic.signature']){
        const response=await middleware(new NextRequest(`https://example.invalid/de${route}`));assert.equal(response.headers.get('x-middleware-rewrite'),`https://example.invalid${route}`);assert.equal(response.status,200);
      }
      const legacy=await middleware(new NextRequest('https://example.invalid/book'));assert.equal(legacy.status,307);assert.equal(legacy.headers.get('location'),'https://example.invalid/de/book');
    });
  }
  process.env.APP_SITE_MODE='under_construction';
  await test('Client query/header values cannot select live mode or bypass validation', async()=>{
    const {middleware}=load('src/middleware.ts',{'@/lib/supabase/middleware':{updateSession:async(_req,response)=>response??NextResponse.next()}});
    const r=await middleware(new NextRequest('https://example.invalid/en/book?APP_SITE_MODE=live',{headers:{'x-app-site-mode':'live'}}));assert.equal(r.status,503);assert.equal(new URL(r.headers.get('x-middleware-rewrite')).pathname,'/under-construction');
    assert.equal((await middleware(new NextRequest('https://example.invalid/fr/book'))).status,404);
    assert.equal((await middleware(new NextRequest('https://example.invalid/de/api/webhooks/whatsapp'))).status,404);
    const denied=load('src/middleware.ts',{'@/lib/supabase/middleware':{updateSession:async()=>new NextResponse(null,{status:401})}});
    assert.equal((await denied.middleware(new NextRequest('https://example.invalid/en/book'))).status,401,'Existing security failures are not replaced');
  });
  await test('Closed public single and recurring creations stop before any database/provider call in both locales',async()=>{
    const {createTranslator}=require('next-intl');
    for(const mode of ['coming_soon','under_construction'])for(const locale of ['de','en']){
      process.env.APP_SITE_MODE=mode;let calls=0;
      const mocks={'next-intl/server':{getTranslations:async()=>createTranslator({locale,messages:require(`../messages/${locale}.json`).siteMode})},'next/cache':{revalidatePath(){throw Error('Unexpected revalidation')}}};
      const reject = () => new Proxy({}, {get(){return ()=>{calls++;throw Error('Unexpected database/provider call')}}});
      const single=load('src/lib/appointments/mutations.ts',mocks,reject);
      const result=await single.createAppointment({});assert(result.error.includes(locale==='de'?'Neue Online-Buchungen':'New online bookings'));assert.equal(calls,0);
      const action=load("src/app/actions/recurring-bookings.ts",mocks,reject);
      assert((await action.createCustomerRecurringBooking({})).error.includes(locale==='de'?'Neue Online-Buchungen':'New online bookings'));assert.equal(calls,0);
      const recurring=load('src/lib/recurring-bookings/service.ts',mocks,reject);
      await assert.rejects(recurring.createRecurringBookingSeries({},'customer'),/Online-Buchungen|online bookings/);assert.equal(calls,0);
      await assert.rejects(recurring.createRecurringBookingSeries({},'admin'),error=>!(/Online-Buchungen|online bookings/.test(error.message)),'Admin entry does not execute the public mode gate');
    }
  });
  console.log(`PASS ${passed} site-mode groups. Synthetic requests only; no DB mutations or sends.`);
})().catch(error=>{console.error(error.stack||error.message);process.exitCode=1}).finally(()=>{if(originalMode===undefined)delete process.env.APP_SITE_MODE;else process.env.APP_SITE_MODE=originalMode});
