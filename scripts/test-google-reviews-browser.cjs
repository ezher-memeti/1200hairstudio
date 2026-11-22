// Optional browser regression: run against a local app with real Places data.
// Install Playwright outside the app and set PLAYWRIGHT_MODULE_PATH if needed.
const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const baseURL = process.env.REVIEWS_TEST_URL || "http://localhost:3000/en";
const launch = process.env.CHROME_EXECUTABLE_PATH
  ? { executablePath: process.env.CHROME_EXECUTABLE_PATH, headless: true }
  : { headless: true };

async function snapshot(track) {
  return track.evaluate((element) => ({
    x: new DOMMatrix(getComputedStyle(element).transform).m41,
    period: element.firstElementChild.getBoundingClientRect().width,
    state: getComputedStyle(element).animationPlayState,
    time: performance.now(),
  }));
}
function movement(before, after) {
  return (after.x - before.x + before.period) % before.period;
}
async function moving(track, page, label) {
  const before = await snapshot(track);
  await page.waitForTimeout(900);
  const after = await snapshot(track);
  assert.equal(after.state, "running", label);
  assert(movement(before, after) > 15, label);
  assert(Math.abs(movement(before, after) - 24 * (after.time - before.time) / 1000) < 4, `${label}: constant rightward speed`);
}
async function open(page) {
  await page.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 120000 });
  const section = page.locator("#reviews");
  await section.waitFor({ timeout: 30000 });
  await section.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => Boolean(document.querySelector("#reviews [role=region]")?.style.getPropertyValue("--announcement-duration")));
  return { section, viewport: section.getByRole("region"), track: section.locator(".announcement-ticker-track") };
}

(async () => {
  const browser = await chromium.launch(launch);
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "no-preference" });
    const { section, viewport, track } = await open(page);
    await page.mouse.move(0, 0);
    // Never seek, pause/play, or change the animation timeline in this suite.
    await moving(track, page, "Initial automatic movement");
    await moving(track, page, "Continued automatic movement");
    await viewport.hover();
    const paused = await snapshot(track);
    await page.waitForTimeout(2100);
    assert(Math.abs((await snapshot(track)).x - paused.x) < .2, "Hover pauses immediately");
    await page.mouse.move(0, 0);
    await moving(track, page, "Mouse-leave resumes");
    await page.keyboard.press("Tab");
    await viewport.focus();
    assert.equal(await track.evaluate((e) => getComputedStyle(e).animationName), "none", "Keyboard focus pauses for reading");
    await section.getByRole("link", { name: "View all reviews" }).focus();
    await moving(track, page, "Leaving keyboard focus resumes without clicking Resume");
    assert.equal(await track.evaluate((e) => getComputedStyle(e).animationIterationCount), "infinite");
    assert.equal(await section.locator("button,details,h1,h2,h3").count(), 0);
    assert.notEqual(await viewport.evaluate((e) => getComputedStyle(e).maskImage), "none");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await moving(track, page, "Autoplay remains enabled with the system motion preference set to reduce");

    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: "no-preference" });
    const phone = await mobile.newPage();
    const touch = await open(phone);
    await moving(touch.track, phone, "Mobile autoplay before interaction");
    const box = await touch.viewport.boundingBox();
    await phone.touchscreen.tap(box.x + 8, box.y + box.height - 2);
    await phone.waitForTimeout(1100);
    await moving(touch.track, phone, "Touch release resumes without a persistent pause");
    assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await mobile.close();
    console.log("PASS actual elapsed-time autoplay, continued movement, hover/resume, keyboard-exit resume, mobile touch resume, infinite iterations and reduced motion. No timeline seeking or messages/reviews submitted.");
  } finally { await browser.close(); }
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
