// Production browser integration with an entirely synthetic local Auth API.
// Build with NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:3099 and a synthetic key.
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const {spawn} = require('node:child_process');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = require('node:path').resolve(__dirname,'..');
const buildDir = process.env.RECOVERY_BUILD_DIR;
assert(buildDir, 'RECOVERY_BUILD_DIR must point to an isolated synthetic-config production build');
const origin='http://127.0.0.1:3059';
const user={id:'00000000-0000-4000-8000-000000000123',aud:'authenticated',role:'authenticated',email:'synthetic@example.invalid',email_confirmed_at:new Date().toISOString(),app_metadata:{provider:'email',providers:['email']},user_metadata:{},created_at:new Date().toISOString()};
const jwt=()=>[ {alg:'HS256',typ:'JWT'}, {sub:user.id,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000)} ].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.')+'.c3ludGhldGlj';
const requests=[];
let recovery, apiError, updates=0, exchanges=0;
const api=http.createServer(async(req,res)=>{
 try {
  const url=new URL(req.url,'http://127.0.0.1:3099');
  res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Access-Control-Allow-Headers','*');res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,OPTIONS');res.setHeader('Content-Type','application/json');
  if(req.method==='OPTIONS'){res.end('{}');return;}
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const body=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):{};
  requests.push({path:url.pathname,method:req.method});
  if(url.pathname==='/auth/v1/recover'){
    recovery={redirect:url.searchParams.get('redirect_to'),challenge:body.code_challenge};
    assert.equal(body.code_challenge_method,'s256');res.end('{}');return;
  }
  if(url.pathname==='/auth/v1/token'){
    exchanges++;
    if(body.auth_code!=='synthetic-success') {res.statusCode=400;res.end(JSON.stringify({code:'otp_expired',msg:'Synthetic expired or already used link'}));return;}
    assert.equal(crypto.createHash('sha256').update(body.code_verifier).digest('base64url'),recovery.challenge);
    res.end(JSON.stringify({access_token:jwt(),refresh_token:'synthetic-refresh',token_type:'bearer',expires_in:3600,user}));return;
  }
  if(url.pathname==='/auth/v1/user'){
    if(req.method==='PUT'){assert.equal(body.password,'SyntheticPassword123!');assert(Object.keys(body).every(key=>['password','code_challenge','code_challenge_method'].includes(key)));updates++;}
    res.end(JSON.stringify(user));return;
  }
  if(url.pathname==='/auth/v1/logout'){res.end('{}');return;}
  res.end('[]');
 } catch(error) {apiError=error;res.statusCode=500;res.end(JSON.stringify({message:'Synthetic API assertion failed'}));}
});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let browser, child;
(async()=>{
 await new Promise(resolve=>api.listen(3099,'127.0.0.1',resolve));
 child=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start','-p','3059'],{cwd:buildDir,env:{...process.env,NEXT_PUBLIC_SITE_URL:'https://1200hairstudio.ch',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:3099',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'synthetic-anon-key'},stdio:'ignore'});
 for(let i=0;i<180;i++){try{await fetch(origin+'/en/reset-password');break;}catch{await delay(500);}}
 browser=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE_PATH,headless:true});
 for(const locale of ['de','en']){
  const context=await browser.newContext();const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  // No browser traffic can reach a real Supabase project or send real notifications.
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.origin===origin || url.origin==='http://127.0.0.1:3099')return route.continue();
    return route.abort();
  });
  await page.goto(`${origin}/${locale}/forgot-password`);
  await page.locator('input[type=email]').fill(user.email);await page.locator('form button[type=submit]').click();
  await page.waitForFunction(()=>!!document.querySelector('form button[disabled]'));
  for(let i=0;!recovery&&i<100;i++)await delay(50);
  assert.equal(recovery.redirect,`https://1200hairstudio.ch/${locale}/reset-password`);
  const before=exchanges, beforeUpdates=updates;
  await page.goto(`${origin}/${locale}/reset-password?code=synthetic-success`);
  await page.locator('input[type=password]').first().waitFor();
  assert.equal(new URL(page.url()).pathname,`/${locale}/reset-password`);
  assert.equal(new URL(page.url()).search,'');
  assert.equal(await page.locator('input[type=password]').count(),2);
  assert.equal(exchanges,before+1,'one PKCE exchange');
  await page.locator('input[type=password]').nth(0).fill('SyntheticPassword123!');await page.locator('input[type=password]').nth(1).fill('SyntheticPassword123!');
  await page.locator('form button[type=submit]').click();await page.waitForURL(`**/${locale}/login?reset=success`);
  assert.equal(updates,beforeUpdates+1,'one confirmed updateUser call');
  // Obtain another verifier so the invalid-code case exercises an actual failed SDK exchange.
  recovery=null;
  await page.goto(`${origin}/${locale}/forgot-password`);
  await page.locator('input[type=email]').fill(user.email);await page.locator('form button[type=submit]').click();
  for(let i=0;!recovery&&i<100;i++)await delay(50);
  assert(recovery);
  for(const suffix of ['?code=synthetic-used','','#error=access_denied&error_code=otp_expired&error_description=synthetic']){
    await page.goto('about:blank'); // Email verification redirects start a new document, not a hash-only navigation.
    await page.goto(`${origin}/${locale}/reset-password${suffix}`);
    await page.getByRole('heading',{name:locale==='de'?'Ungültiger oder abgelaufener Link':'Invalid Or Expired Link'}).waitFor();
    assert.equal(await page.locator('input[type=password]').count(),0);
    assert.equal(await page.locator(`a[href="/${locale}/forgot-password"]`).count(),1);
    assert.equal(new URL(page.url()).hash,'');assert.equal(new URL(page.url()).search,'');
  }
  assert.deepEqual(errors,[]);await context.close();recovery=null;
  console.log(`PASS ${locale}: canonical redirect, real SDK S256 exchange, form, mocked updateUser, sign-out/login, invalid/expired/used links; no real accounts or emails`);
 }
 assert(requests.some(req=>req.path==='/auth/v1/logout'));assert.equal(apiError,undefined);
})().catch(error=>{console.error(error.message);process.exitCode=1}).finally(async()=>{await browser?.close();child?.kill('SIGTERM');await new Promise(resolve=>api.close(resolve));});
