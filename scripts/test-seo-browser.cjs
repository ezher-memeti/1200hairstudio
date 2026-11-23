// Production-build, read-only browser audit. Never submits booking/auth forms.
const assert = require('node:assert/strict');
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
let checkpoint = 'startup';
const build=process.env.SEO_BUILD_DIR;
assert(build&&fs.existsSync(path.join(build,'.next/BUILD_ID')),'Set SEO_BUILD_DIR to a production build.');
async function start(mode,port){
  const child=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start','--hostname','0.0.0.0','--port',String(port)],{cwd:build,env:{...process.env,APP_SITE_MODE:mode},stdio:['ignore','pipe','pipe']});
  let ready=false;child.stdout.on('data',c=>{if(c.toString().includes('Ready'))ready=true;});child.stderr.on('data',()=>{});
  for(let i=0;i<200&&!ready;i++){if(child.exitCode!==null)throw Error('Server startup failed');await new Promise(r=>setTimeout(r,100));}
  if(!ready){child.kill();throw Error('Server startup timeout');}return child;
}
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE_PATH,headless:true});
  try{
    for(const [i,mode] of ['live','coming_soon','under_construction'].entries()){
      const port=3041+i,base=`http://localhost:${port}`,server=await start(mode,port);
      const context=await browser.newContext({viewport:{width:390,height:900}}),page=await context.newPage();
      try{
        let entityId;
        for(const locale of ['de','en'])for(const route of ['','/book','/privacy','/imprint']){
          const response=await page.goto(`${base}/${locale}${route}`,{waitUntil:'networkidle',timeout:120000});
          assert.equal(response.status(),mode==='under_construction'?503:200);
          assert.equal(await page.locator('html').getAttribute('lang'),locale);
          assert.equal(await page.locator('h1').count(),1);
          const canonical=await page.locator('link[rel=canonical]').getAttribute('href'),origin=new URL(canonical).origin;
          const suffix=mode==='live'?route:mode==='coming_soon'?'/coming-soon':'/under-construction';
          assert.equal(canonical,origin+`/${locale}`+suffix);
          for(const [lang,prefix]of [['de-CH','de'],['en','en'],['x-default','de']])assert.equal(await page.locator(`link[rel=alternate][hreflang="${lang}"]`).getAttribute('href'),origin+`/${prefix}`+suffix);
          const robots=await page.locator('meta[name=robots]').evaluateAll(nodes=>nodes.map(n=>n.content));
          assert(robots.every(v=>mode==='live'?!v.includes('noindex'):v.includes('noindex')));
          const image=await page.locator('meta[property="og:image"]').getAttribute('content');assert.equal(image,origin+'/brand/logo.png');
          assert.equal((await page.request.get(base+new URL(image).pathname)).status(),200);
          assert.equal(await page.locator('meta[property="og:locale"]').getAttribute('content'),locale==='de'?'de_CH':'en_GB');
          assert.equal(await page.locator('meta[name="twitter:card"]').getAttribute('content'),'summary');
          const scripts=await page.locator('script[type="application/ld+json"]').allTextContents();
          if(mode==='live'&&route===''){
            assert.equal(scripts.length,1);const data=JSON.parse(scripts[0]);assert.equal(data['@type'],'HairSalon');
            if(entityId)assert.equal(data['@id'],entityId);entityId=data['@id'];
            assert(!('aggregateRating'in data));assert(!('geo'in data));
            if(data.address){assert((await page.locator('#visit').innerText()).includes(data.address.streetAddress));assert((await page.locator('#visit').innerText()).includes(data.address.postalCode));}
            for(const hours of data.openingHoursSpecification??[])assert((await page.locator('#visit').innerText()).includes(hours.opens));
            if(data.telephone)assert(await page.locator(`a[href^="tel:"]`).count());
            for(const url of data.sameAs??[])assert(await page.locator(`a[href="${url}"]`).count());
            assert.equal(await page.locator('footer a[href="https://www.instagram.com/"]').count(),0);
            for(const link of await page.locator('a[href^="#"]').all()){const id=(await link.getAttribute('href')).slice(1);if(id)assert(await page.locator(`[id="${id}"]`).count(),'Homepage anchor target exists');}
            // Ensure important text is server-rendered for a crawler without hydration.
            const html=await (await page.request.get(`${base}/${locale}`,{headers:{'user-agent':'Googlebot'}})).text();
            assert(html.includes('application/ld+json'));assert(/hreflang="de-CH"/i.test(html));assert(html.includes('id="services"'));
          }else assert.equal(scripts.length,0);
          for(const width of [320,375,390,430,768,1440]){checkpoint = `${mode} ${locale}${route} ${width}px`;await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${mode} ${locale}${route} ${width} overflow`);}
        }
        const sitemap=await page.request.get(base+'/sitemap.xml');assert.equal(sitemap.status(),200);const xml=await sitemap.text();
        assert.equal((xml.match(/<loc>/g)||[]).length,mode==='live'?8:0);assert(!xml.includes('<lastmod>'));assert(!xml.includes('/admin'));
        const robots=await page.request.get(base+'/robots.txt');assert.equal(robots.status(),200);const text=await robots.text();assert(text.includes('Allow: /'));assert(text.includes('Sitemap: '));assert(!text.includes('Disallow: /\n'));
        for(const route of ['/de/login','/en/reset-password']){await page.goto(base+route,{waitUntil:'domcontentloaded'});assert((await page.locator('meta[name=robots]').getAttribute('content')).includes('noindex'));assert.equal(await page.locator('link[rel=canonical]').count(),0);}
        const redirect=await page.request.get(base+'/',{maxRedirects:0});assert.equal(redirect.status(),307);assert(new URL(redirect.headers().location).pathname.match(/^\/(de|en)$/));
        if(mode==='live'){const missing=await page.goto(base+'/de/seo-nonexistent',{waitUntil:'domcontentloaded'});assert.equal(missing.status(),404);assert((await page.locator('meta[name=robots]').all()).length>0);}
        console.log(`PASS ${mode}: rendered bilingual SEO, status codes, schema, social asset, sitemap, robots, private noindex and six viewport widths`);
      }finally{await context.close();server.kill();await new Promise(r=>server.once('exit',r));}
    }
  }finally{await browser.close();}
})().catch(error=>{console.error('FAIL SEO browser regression at '+checkpoint+'; assertion location:',String(error.stack).split('\n').filter(line=>line.includes('test-seo-browser.cjs')).join('\n'));process.exitCode=1;});
