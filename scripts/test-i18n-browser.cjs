// Optional real-browser, read-only UI smoke test. No login/booking/messages are submitted.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const origin = process.env.I18N_TEST_URL || 'http://localhost:3000';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_EXECUTABLE_PATH, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${origin}/de/login?reset=success#form`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.getByRole('button', { name: 'EN', exact: true }).click();
    await page.waitForURL('**/en/login?reset=success#form', { timeout: 60000, waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    assert((await page.locator('h1').textContent()).includes('Welcome'));
    const cookie = (await page.context().cookies()).find(value => value.name === '1200_locale');
    assert.equal(cookie.value, 'en');
    assert.equal(cookie.httpOnly, true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    await page.goto(`${origin}/login`, { waitUntil: 'domcontentloaded' });
    assert(page.url().includes('/en/login'));
    console.log('PASS switch preserves route/query/hash and persists through refresh/legacy URL');
    for (const locale of ['de', 'en']) {
      for (const path of ['', '/book', '/login', '/register', '/forgot-password', '/reset-password', '/privacy', '/imprint']) {
        const response = await page.goto(`${origin}/${locale}${path}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
        assert.equal(response.status(), 200, `${locale}${path}`);
        assert.equal(await page.locator('html').getAttribute('lang'), locale);
      }
      for (const width of [1920, 1440, 1280, 1024, 768, 430, 390, 375, 320]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${origin}/${locale}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
        await page.evaluate(() => document.fonts.ready);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${locale} ${width} overflow`);
        const switcher = page.getByRole('button', { name: locale.toUpperCase(), exact: true });
        assert.equal(await switcher.getAttribute('aria-pressed'), 'true');
      }
    }
    const fs = require('node:fs');
    const path = require('node:path');
    const collect = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? collect(path.join(directory, entry.name)) : entry.name === 'page.tsx' ? [path.join(directory, entry.name)] : []);
    const adminRoutes = collect(path.resolve(__dirname, '../src/app/admin')).map(file => file.split('/src/app')[1].replace(/\/\([^/]+\)/g, '').replace('/page.tsx', '')).filter(route => route !== '/admin/login' && !route.includes('['));
    let guarded = 0;
    for (const locale of ['de','en']) for (const route of [...adminRoutes, '/account']) {
      const response = await fetch(`${origin}/${locale}${route}`, { redirect: 'manual' });
      assert([303,307,308].includes(response.status), `${locale}${route}: protected route must redirect`);
      const location = response.headers.get('location');
      // Aliases can redirect to another guarded admin route; final login must remain protected.
      assert(location?.includes(`/${locale}/`), `${locale}${route}: preserve interface locale`);
      guarded++;
    }
    console.log(`PASS ${guarded} anonymous admin/customer route requests preserve localized redirects; no authenticated writes`);
    assert.deepEqual(errors, []);
    console.log('PASS public routes, DE/EN HTML language and desktop/tablet/mobile layouts; no browser errors');
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
