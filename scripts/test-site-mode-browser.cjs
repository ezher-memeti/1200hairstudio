// Uses one production build in three isolated local processes. Read-only public
// requests and anonymous locale cookies only; no booking submissions or job invocations.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const buildDirectory = process.env.SITE_MODE_BUILD_DIR;
assert(buildDirectory && fs.existsSync(path.join(buildDirectory, '.next/BUILD_ID')), 'Set SITE_MODE_BUILD_DIR to an existing production build.');
const nextBin = require.resolve('next/dist/bin/next');
const output = process.env.SITE_MODE_SCREENSHOT_DIR;
const widths = [320,375,430,768,1024,1280,1440,1920];
async function start(mode, port) {
  const child = spawn(process.execPath, [nextBin,'start','--hostname','0.0.0.0','--port',String(port)], { cwd:buildDirectory, env:{...process.env,APP_SITE_MODE:mode}, stdio:['ignore','pipe','pipe'] });
  let ready=false;
  child.stdout.on('data',chunk=>{if(chunk.toString().includes('Ready'))ready=true;});
  // Consume without printing server URLs, cookies, environment or auth diagnostics.
  child.stderr.on('data',()=>{});
  for(let i=0;i<200&&!ready;i++){if(child.exitCode!==null)throw Error(`Production server failed for ${mode}`);await new Promise(resolve=>setTimeout(resolve,100));}
  if(!ready){child.kill();throw Error('Server startup timeout');}
  return child;
}
(async()=>{
  if(output)fs.mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE_PATH,headless:true});
  try{
    for(const [index,mode] of ['live','coming_soon','under_construction'].filter(mode=>!process.env.SITE_MODE_TEST_ONLY||mode===process.env.SITE_MODE_TEST_ONLY).entries()){
      const port=3021+index,origin=`http://localhost:${port}`;let server;
      try{
        server=await start(mode,port);
        const context=await browser.newContext({viewport:{width:1440,height:1000}});
        const page=await context.newPage(),errors=[];
        page.on('pageerror',error=>errors.push(error.message));
        for(const locale of ['de','en']){
          for(const route of ['/','/book','/privacy','/coming-soon','/under-construction']){
            const response=await page.goto(`${origin}/${locale}${route==='/'?'':route}`,{waitUntil:'domcontentloaded',timeout:120000});
            assert.equal(response.status(),mode==='under_construction'?503:200,`${mode} ${locale}${route}`);
            if(mode!=='live'){
              assert.equal(await page.locator('[data-site-mode]').getAttribute('data-site-mode'),mode);
              assert((await response.allHeaders())['x-robots-tag'].includes('noindex'));
              assert((await page.locator('meta[name="robots"]').evaluateAll(nodes=>nodes.map(node=>node.content))).every(value=>value.includes('noindex')));
              assert((await page.locator('link[rel="canonical"]').getAttribute('href')).endsWith(`/${locale}/${mode==='coming_soon'?'coming-soon':'under-construction'}`));
              if(mode==='under_construction')assert.equal((await response.allHeaders())['retry-after'],'300');
            }else if(route==='/')assert.equal(await page.locator('[data-site-mode]').count(),0);
            assert.equal(await page.locator('html').getAttribute('lang'),locale);
          }
        }
        // Direct preview routes are reachable in live mode without publishing a switch.
        const paths=mode==='live'?['coming-soon','under-construction']:[mode==='coming_soon'?'coming-soon':'under-construction'];
        for(const route of paths)for(const locale of ['de','en']){
          await page.goto(`${origin}/${locale}/${route}`,{waitUntil:'domcontentloaded'});
          for(const width of widths){
            await page.setViewportSize({width,height:900});await page.evaluate(()=>document.fonts.ready);
            assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${mode} ${route} ${locale} ${width} overflow`);
            const heading=page.locator('h1');const bounds=await heading.boundingBox();assert(bounds&&bounds.x>=0&&bounds.x+bounds.width<=width+1,'Heading fits viewport');
            assert(await heading.isVisible());
            for(const button of await page.locator('nav button').all()){const box=await button.boundingBox();assert(box&&box.height>=44,'Touch-friendly language selector');}
            if(output&&[375,1440].includes(width)){await page.waitForTimeout(1050);await page.screenshot({path:path.join(output,`${mode}-${route}-${locale}-${width}.png`),fullPage:true});}
          }
        }
        // This invokes only the existing anonymous locale-cookie action.
        await page.goto(`${origin}/de/coming-soon`,{waitUntil:'domcontentloaded'});
        await page.getByRole('button',{name:'EN',exact:true}).click();
        await page.waitForURL('**/en/coming-soon',{waitUntil:'domcontentloaded'});
        assert.equal(await page.locator('html').getAttribute('lang'),'en');
        await page.reload({waitUntil:'domcontentloaded'});
        if(mode!=='live')assert.equal(await page.locator('[data-site-mode]').getAttribute('data-site-mode'),mode);
        await page.emulateMedia({reducedMotion:'reduce'});
        const animation=await page.locator('main').evaluate(el=>getComputedStyle(el).animationName);assert.equal(animation,'none');
        // Anonymous protected routes must still resolve through their original guards.
        for(const route of ['/en/admin','/en/account']){const r=await fetch(origin+route,{redirect:'manual'});assert([303,307,308].includes(r.status));assert(r.headers.get('location')?.includes('/en/'));}
        for(const route of ['/en/login','/en/reset-password']){const r=await fetch(origin+route,{redirect:'manual'});assert.equal(r.status,200);assert(!r.headers.get('x-robots-tag'),'No mode rewrite on auth pages');}
        const webhook=await fetch(origin+'/api/webhooks/whatsapp');assert([403,503].includes(webhook.status));assert((webhook.headers.get('content-type')||'').includes('application/json'));assert.equal(webhook.headers.get('retry-after'),null);
        assert.equal((await fetch(origin+'/brand/logo.png')).status,200);
        assert.equal((await fetch(origin+'/images/background-work.webp')).status,200);
        assert.deepEqual(errors,[]);
        await context.close();console.log(`PASS ${mode}: public routing/status/SEO, DE/EN switching/refresh, all eight widths, reduced motion, protected/auth/webhook handoff and assets`);
      }finally{if(server){server.kill('SIGTERM');await new Promise(resolve=>server.once('exit',resolve));}}
    }
  }finally{await browser.close();}
})().catch(error=>{console.error(error.stack||error.message);process.exitCode=1});
