// Read-only isolated production-build audit. Synthetic backend, no real credentials or push sends.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),{spawn}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const build=process.env.PUSH_BUILD_DIR;assert(build&&fs.existsSync(path.join(build,'.next/BUILD_ID')),'Set PUSH_BUILD_DIR to the isolated production build (synthetic Supabase URL 127.0.0.1:3999).');
(async()=>{let browser;const api=http.createServer((req,res)=>{res.setHeader('content-type','application/json');if(req.method!=='GET'){res.writeHead(405).end('{}');return;}res.end('[]');});await new Promise(r=>api.listen(3999,'127.0.0.1',r));try{
 browser=await chromium.launch({headless:true});
 for(const [index,mode]of ['live','coming_soon','under_construction'].entries()){
 const port=3055+index,base=`http://localhost:${port}`,server=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start','--hostname','0.0.0.0','--port',String(port)],{cwd:build,env:{...process.env,APP_SITE_MODE:mode,NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:3999',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'synthetic-build-only',SUPABASE_SERVICE_ROLE_KEY:'synthetic-build-only',NEXT_PUBLIC_SITE_URL:'https://1200hairstudio.ch'},stdio:['ignore','pipe','pipe']});let ready=false;server.stdout.on('data',x=>{if(x.toString().includes('Ready'))ready=true;});let stderr='';server.stderr.on('data',data=>{stderr+=data.toString();});
 const context=await browser.newContext(),page=await context.newPage();await context.route('https://1200hairstudio.ch/**',route=>route.abort());try{
 for(let i=0;i<200&&!ready;i++){if(server.exitCode!==null)throw Error('Server exited');await new Promise(r=>setTimeout(r,100));}assert(ready);
 const manifest=await page.request.get(base+'/manifest.webmanifest');assert.equal(manifest.status(),200);const json=await manifest.json();assert.equal(json.display,'standalone');assert.equal(json.scope,'/');assert.equal(json.start_url,'/admin');assert.equal(json.id,'/');
 for(const icon of json.icons)assert.equal((await page.request.get(base+icon.src)).status(),200);
 const sw=await page.request.get(base+'/sw.js');assert.equal(sw.status(),200);assert.equal(sw.headers()['service-worker-allowed'],'/');assert(sw.headers()['cache-control'].includes('no-store'));assert(!sw.headers().location);
 for(const locale of ['en','de']){
 const response=await page.goto(`${base}/${locale}/admin/login`,{waitUntil:'domcontentloaded'});assert.equal(response.status(),200,stderr);await page.locator('link[rel=manifest]').waitFor({state:'attached'});if(!await page.locator('link[rel=manifest]').count()){ fs.writeFileSync('/tmp/1200-push-page.html',await page.content());throw new Error('Manifest missing: '+mode+' '+page.url()+' '+stderr); }assert.equal(new URL(await page.locator('link[rel=manifest]').getAttribute('href'),base).pathname,'/manifest.webmanifest');assert.equal(await page.locator('meta[name=mobile-web-app-capable]').getAttribute('content'),'yes');
 const worker=await page.evaluate(async()=>{const registration=await navigator.serviceWorker.register('/sw.js',{scope:'/'});await navigator.serviceWorker.ready;return{scope:new URL(registration.scope).pathname,count:(await navigator.serviceWorker.getRegistrations()).length};});assert.equal(worker.scope,'/');assert.equal(worker.count,1);
 assert.equal((await page.request.get(base+'/api/admin/push/subscriptions')).status(),401);
 for (const route of ['/api/admin/notifications','/api/admin/notifications/count']) assert.equal((await page.request.get(base+route)).status(),401);
 assert.equal((await page.request.post(base+'/api/admin/notifications/read-all',{data:{}})).status(),401);
 await page.goto(`${base}/${locale}/admin/push/11111111-1111-4111-8111-111111111111`,{waitUntil:'domcontentloaded'});await page.waitForURL(url=>url.pathname===`/${locale}/admin/login`);assert.equal(new URL(page.url()).searchParams.get('push'),'11111111-1111-4111-8111-111111111111');
 }
 console.log('PASS isolated production '+mode+': manifest/icons/SW HTTP 200, standalone metadata, one registered worker, unauthenticated API rejection and localized notification-login intent.');
 }finally{await context.close();server.kill();await new Promise(r=>server.once('exit',r));}
 }
 }finally{await browser?.close();await new Promise(r=>api.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
