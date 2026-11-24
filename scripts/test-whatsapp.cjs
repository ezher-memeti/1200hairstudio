const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
function load(file, mocks = {}) {
  const source = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", source)((name) => {
    if (name === "server-only") return {};
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.startsWith("@/")) throw new Error(`Unmocked import: ${name}`);
    return require(name);
  }, module, module.exports);
  return module.exports;
}
const provider = load("src/lib/whatsapp/provider.ts");
const baseline = {
  WHATSAPP_TEST_ENABLED: "true", WHATSAPP_ACCESS_TOKEN: "synthetic-secret-never-log",
  WHATSAPP_PHONE_NUMBER_ID: "123456789", WHATSAPP_BUSINESS_ACCOUNT_ID: "987654321",
  WHATSAPP_API_VERSION: "v99.0", WHATSAPP_TEST_RECIPIENTS: "+41791234567,41791234568",
};
const saved = Object.fromEntries(Object.keys(baseline).map((k) => [k, process.env[k]]));
const originalFetch = global.fetch;
const originalWarn = console.warn;
const logs = [];
console.warn = (...args) => logs.push(JSON.stringify(args));
let calls = [];
function reset() {
  Object.assign(process.env, baseline);
  calls = [];
  global.fetch = async (...args) => { calls.push(args); return Response.json({ messages: [{ id: "wamid.synthetic" }] }); };
}
function handler({ user = { id: "admin" }, role = "admin", rate, authError, prepareError = false, persisted = true } = {}) {
  const limiter = load("src/lib/whatsapp/test-rate-limit.ts");
  return load("src/app/api/admin/whatsapp/test/route.ts", {
    "@/lib/auth/customer": { getCurrentUserRole: async () => { if (authError) throw authError; return { user, role }; } },
    "@/lib/whatsapp/provider": provider,
    "@/lib/whatsapp/deliveries": {
      prepareWhatsAppTest: async () => { if (prepareError) throw new Error("private DB error"); return "test-outbox"; },
      recordWhatsAppTest: async () => persisted,
      failWhatsAppTest: async () => {},
    },
    "@/lib/whatsapp/test-rate-limit": rate ? { consumeWhatsAppTestAttempt: rate } : limiter,
  }).POST;
}
function request(body = { recipient: "+41791234567" }, headers = {}) {
  return new Request("http://localhost:3000/api/admin/whatsapp/test", {
    method: "POST", headers: { "Content-Type": "application/json", "X-WhatsApp-Test": "1", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
let passed = 0;
async function test(name, fn) { reset(); await fn(); passed++; console.log(`PASS ${name}`); }
(async () => {
  try {
    await test("Anonymous request returns 401 without provider call", async () => {
      const r = await handler({ user: null, role: null })(request()); assert.equal(r.status, 401); assert.equal(calls.length, 0);
    });
    await test("Customer and unknown roles return 403", async () => {
      for (const role of ["customer", null, "owner"]) assert.equal((await handler({ role })(request())).status, 403);
      assert.equal(calls.length, 0);
    });
    await test("Auth infrastructure errors fail closed and hide exception details", async () => {
      const r = await handler({ authError: new Error(baseline.WHATSAPP_ACCESS_TOKEN) })(request()); assert.equal(r.status, 500); assert(!(await r.text()).includes(baseline.WHATSAPP_ACCESS_TOKEN)); assert.equal(calls.length, 0);
    });
    await test("Test switch defaults closed", async () => {
      delete process.env.WHATSAPP_TEST_ENABLED; assert.equal((await handler()(request())).status, 503); assert.equal(calls.length, 0);
    });
    await test("Missing each required provider setting returns sanitized 503", async () => {
      for (const key of Object.keys(baseline).filter((k) => k !== "WHATSAPP_TEST_ENABLED")) {
        reset(); delete process.env[key]; const r = await handler()(request()); assert.equal(r.status, 503, key); assert.equal(calls.length, 0);
      }
    });
    await test("Invalid IDs, API version and malformed allowlist fail closed", async () => {
      for (const [key, value] of [["WHATSAPP_API_VERSION", "../me"], ["WHATSAPP_PHONE_NUMBER_ID", "1/messages"], ["WHATSAPP_BUSINESS_ACCOUNT_ID", "invalid"], ["WHATSAPP_TEST_RECIPIENTS", "41791234567,"]]) {
        reset(); process.env[key] = value; assert.equal((await handler()(request())).status, 503); assert.equal(calls.length, 0);
      }
    });
    await test("Invalid and non-allowlisted recipients never reach Meta", async () => {
      for (const recipient of [null, 41791234567, "", "0041791234567", "41790000000", "41 791234567", { phone: "41791234567" }]) {
        assert.equal((await handler()(request({ recipient }))).status, 400);
      } assert.equal(calls.length, 0);
    });
    await test("Cross-origin, missing custom header and non-JSON requests rejected", async () => {
      assert.equal((await handler()(request(undefined, { Origin: "https://evil.example" }))).status, 403);
      assert.equal((await handler()(request(undefined, { "X-WhatsApp-Test": "" }))).status, 403);
      assert.equal((await handler()(request(undefined, { "Content-Type": "text/plain" }))).status, 400);
      assert.equal(calls.length, 0);
    });
    await test("Malformed, oversized and arbitrary template/text inputs rejected", async () => {
      for (const input of ["{", "x".repeat(1025), [], null, {}, { recipient: "41791234567", template: "other" }, { recipient: "41791234567", text: "hello" }]) {
        assert.equal((await handler()(request(input))).status, 400);
      } assert.equal(calls.length, 0);
    });
    await test("Allowlisted admin send uses exact fixed template, version, auth and timeout signal", async () => {
      const r = await handler()(request(undefined, { Origin: "http://localhost:3000" }));
      assert.equal(r.status, 200); assert.equal(r.headers.get("cache-control"), "no-store");
      assert.deepEqual(await r.json(), { success: true, messageId: "wamid.synthetic", outboxId: "test-outbox", status: "accepted", persisted: true });
      assert.equal(calls.length, 1); const [url, options] = calls[0];
      assert.equal(url, "https://graph.facebook.com/v99.0/123456789/messages");
      assert.equal(options.headers.Authorization, `Bearer ${baseline.WHATSAPP_ACCESS_TOKEN}`);
      assert.equal(options.redirect, "error"); assert(options.signal instanceof AbortSignal);
      assert.deepEqual(JSON.parse(options.body), { messaging_product: "whatsapp", to: "41791234567", type: "template", template: { name: "hello_world", language: { code: "en_US" } } });
    });
    await test("Meta 400/401/429/500 errors are sanitized, without retries", async () => {
      for (const status of [400, 401, 429, 500]) {
        let attempts = 0; global.fetch = async () => { attempts++; return Response.json({ error: { message: baseline.WHATSAPP_ACCESS_TOKEN } }, { status }); };
        const r = await handler()(request()); assert.equal(r.status, 502); assert.deepEqual(await r.json(), { success: false, error: { code: "provider_rejected" } }); assert.equal(attempts, 1);
      }
    });
    await test("Network failures never expose exception text", async () => {
      global.fetch = async () => { throw new Error(baseline.WHATSAPP_ACCESS_TOKEN); };
      const r = await handler()(request()); assert.equal(r.status, 502); assert.equal((await r.json()).error.code, "provider_unavailable");
    });
    await test("Malformed Meta JSON or missing/invalid message ID fails safely", async () => {
      for (const data of [null, {}, { messages: [] }, { messages: [{ id: baseline.WHATSAPP_ACCESS_TOKEN }] }]) {
        global.fetch = async () => Response.json(data); assert.equal((await handler()(request())).status, 502);
      }
      global.fetch = async () => new Response("not json"); assert.equal((await handler()(request())).status, 502);
    });
    await test("Request timeout aborts send and returns 504", async () => {
      const set = global.setTimeout; global.setTimeout = (fn, ms) => { assert.equal(ms, 10000); return set(fn, 1); };
      global.fetch = async (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
      try { const r = await handler()(request()); assert.equal(r.status, 504); assert.equal((await r.json()).error.code, "provider_timeout"); } finally { global.setTimeout = set; }
    });
    await test("Concurrent attempts share process budget; rate-limited requests never send", async () => {
      const post = handler(); const results = await Promise.all(Array.from({ length: 8 }, () => post(request())));
      assert.equal(results.filter((r) => r.status === 200).length, 3); assert.equal(results.filter((r) => r.status === 429).length, 5); assert.equal(calls.length, 3);
      assert(Number(results.find((r) => r.status === 429).headers.get("retry-after")) > 0);
    });
    await test("Limiter resets after window; rejected sends still consume attempts", async () => {
      const limiter = load("src/lib/whatsapp/test-rate-limit.ts");
      for (let i = 0; i < 3; i++) assert.equal(limiter.consumeWhatsAppTestAttempt(1000), 0);
      assert.equal(limiter.consumeWhatsAppTestAttempt(2000), 59); assert.equal(limiter.consumeWhatsAppTestAttempt(61000), 0);
      global.fetch = async () => new Response("failed", { status: 500 }); const post = handler();
      for (let i = 0; i < 3; i++) assert.equal((await post(request())).status, 502);
      assert.equal((await post(request())).status, 429);
    });
    await test("Database preflight failure prevents provider send", async () => {
      const r = await handler({ prepareError: true })(request()); assert.equal(r.status, 503); assert.equal(calls.length, 0);
    });
    await test("Accepted message with persistence failure stays successful and is not resent", async () => {
      const r = await handler({ persisted: false })(request()); assert.equal(r.status, 200);
      const body = await r.json(); assert.equal(body.success, true); assert.equal(body.persisted, false);
      assert.equal(body.messageId, "wamid.synthetic"); assert.equal(body.warning, "accepted_not_fully_recorded_do_not_resend"); assert.equal(calls.length, 1);
    });
    assert(!logs.join(" ").includes(baseline.WHATSAPP_ACCESS_TOKEN));
    console.log(`PASS ${passed} WhatsApp tests; no live provider requests or database writes.`);
  } finally {
    global.fetch = originalFetch; console.warn = originalWarn;
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
