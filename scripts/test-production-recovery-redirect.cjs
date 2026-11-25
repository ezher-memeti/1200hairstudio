// Read-only production UI check. Intercept recovery locally; block every remote mutation.
// This does NOT send recovery mail, verify a real code, or modify a production account.
const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
let checkpoint='launch';
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE_PATH,headless:true});
  try {
    for(const locale of ['de','en']){
      const context=await browser.newContext();const page=await context.newPage();const destinations=[];const blockedMethods=[];
      try {
        await context.route('**/*',async route=>{
          const request=route.request(),url=new URL(request.url());
          if(request.method()==='POST'&&url.pathname==='/auth/v1/recover'){
            const target=new URL(url.searchParams.get('redirect_to'));
            destinations.push({origin:target.origin,path:target.pathname});
            return route.fulfill({status:200,contentType:'application/json',body:'{}',headers:{'access-control-allow-origin':'https://1200hairstudio.ch'}});
          }
          if(!['GET','HEAD','OPTIONS'].includes(request.method())){blockedMethods.push({method:request.method(),origin:url.origin,path:url.pathname});return route.abort();}
          return route.continue();
        });
        checkpoint=locale+' loading forgot-password';
        const response=await page.goto(`https://1200hairstudio.ch/${locale}/forgot-password`,{waitUntil:'domcontentloaded'});
        assert.equal(response.status(),200);
        await page.waitForLoadState('networkidle');
        checkpoint=locale+' filling form';
        await page.locator('form input[type=email]').fill('synthetic@example.invalid');
        await page.locator('form button[type=submit]').click();
        for(let i=0;destinations.length===0&&i<100;i++)await page.waitForTimeout(100);
        checkpoint=locale+' checking intercepted redirect';
        console.log('Observed safe destination metadata: '+JSON.stringify(destinations));
        if(!destinations.length)console.log('Blocked mutation metadata: '+JSON.stringify(blockedMethods));
        assert.deepEqual(destinations,[{origin:'https://1200hairstudio.ch',path:`/${locale}/reset-password`}]);
        console.log(`PASS deployed ${locale}: intercepted redirectTo = https://1200hairstudio.ch/${locale}/reset-password; Auth request fulfilled locally, no email sent.`);
      } finally {await context.close();}
    }
  } finally {await browser.close();}
})().catch(()=>{console.error('FAIL deployed recovery redirect check at '+checkpoint+'. No Auth mutations were sent; inspect the deployed build/configuration.');process.exitCode=1});
