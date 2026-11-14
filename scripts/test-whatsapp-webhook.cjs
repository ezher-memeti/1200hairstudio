const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const ts = require("typescript");
function load(file, mocks = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, "..", file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "module", "exports", code)((name) => {
    if (name === "server-only") return {};
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.startsWith("@/")) throw new Error(`Unmocked import ${name}`);
    return require(name);
  }, module, module.exports);
  return module.exports;
}
const env = { WHATSAPP_APP_SECRET: "synthetic-app-secret", WHATSAPP_WEBHOOK_VERIFY_TOKEN: "synthetic-verify-token", WHATSAPP_BUSINESS_ACCOUNT_ID: "987654321", WHATSAPP_PHONE_NUMBER_ID: "123456789", WHATSAPP_TEST_RECIPIENTS: "41791234567" };
const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
Object.assign(process.env, env);
const provider = load("src/lib/whatsapp/provider.ts");
const webhook = load("src/lib/whatsapp/webhook.ts", { "@/lib/whatsapp/provider": provider });
const warnings = []; const warn = console.warn; console.warn = (...v) => warnings.push(JSON.stringify(v));
const outbox = { id: "outbox", event_type: "WHATSAPP_TEST", channel: "WHATSAPP", recipient: "41791234567", payload: { test: true }, status: "COMPLETED", created_at: new Date().toISOString() };
const delivery = { id: "delivery", outbox_id: "outbox", provider: "META_WHATSAPP", provider_message_id: "wamid.synthetic", status: "SENT", sent_at: null, delivered_at: null, read_at: null, error_message: null };
function database({ deliveries = [delivery], outboxes = [outbox], failRead = false, failWrite = false, failOutboxComplete = false } = {}) {
  const tables = { notification_outbox: structuredClone(outboxes), notification_deliveries: structuredClone(deliveries) };
  let writes = 0;
  return { tables, get writes() { return writes; }, from(table) {
    let op = "select", value, single = false, cap = Infinity; const filters = [];
    function field(row, key) {
      if (key.startsWith("outbox.")) { row = tables.notification_outbox.find((r) => r.id === row.outbox_id); key = key.slice(7); }
      if (key === "payload->>test") return String(row?.payload?.test);
      return row?.[key];
    }
    const q = {
      select() { return q; }, single() { single = true; return q; }, limit(n) { cap = n; return q; },
      eq(k, v) { filters.push((r) => field(r, k) === v); return q; }, is(k, v) { return q.eq(k, v); },
      gte(k, v) { filters.push((r) => field(r, k) >= v); return q; },
      insert(v) { op = "insert"; value = v; return q; }, update(v) { op = "update"; value = v; return q; },
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          if ((op === "select" && failRead) || (op !== "select" && failWrite) || (failOutboxComplete && table === "notification_outbox" && op === "update" && value.status === "COMPLETED")) return { data: null, error: { message: "private DB error" } };
          let rows = tables[table].filter((r) => filters.every((f) => f(r))).slice(0, cap);
          if (op === "insert") { const r = { id: `new-${tables[table].length}`, created_at: new Date().toISOString(), ...value }; tables[table].push(r); rows = [r]; writes++; }
          if (op === "update") { rows.forEach((r) => Object.assign(r, value)); if (rows.length) writes++; }
          return { data: structuredClone(single ? rows[0] ?? null : rows), error: null };
        }).then(resolve, reject);
      },
    }; return q;
  } };
}
function setup(options) {
  const db = database(options);
  const deliveries = load("src/lib/whatsapp/deliveries.ts", { "@/lib/supabase/admin": { createAdminClient: () => db } });
  const route = load("src/app/api/webhooks/whatsapp/route.ts", { "@/lib/whatsapp/webhook": webhook, "@/lib/whatsapp/deliveries": deliveries });
  return { db, deliveries, ...route };
}
function payload(statuses = [{ id: "wamid.synthetic", status: "delivered", timestamp: "1700000002", recipient_id: "41791234567" }]) {
  return { object: "whatsapp_business_account", entry: [{ id: env.WHATSAPP_BUSINESS_ACCOUNT_ID, changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: env.WHATSAPP_PHONE_NUMBER_ID }, statuses } }] }] };
}
function event(status, timestamp = "1700000002", extra = {}) { return { id: "wamid.synthetic", status, timestamp, recipient_id: "41791234567", ...extra }; }
function post(value, { signature, secret = env.WHATSAPP_APP_SECRET } = {}) {
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  const headers = { "Content-Type": "application/json" };
  if (signature !== null) headers["X-Hub-Signature-256"] = signature ?? `sha256=${crypto.createHmac("sha256", secret).update(raw).digest("hex")}`;
  return new Request("https://preview.example/api/webhooks/whatsapp", { method: "POST", headers, body: raw });
}
function get(params) { return new Request('https://preview.example/api/webhooks/whatsapp?' + new URLSearchParams(params)); }
let passed = 0;
async function test(name, fn) { Object.assign(process.env, env); await fn(); passed++; console.log(`PASS ${name}`); }
(async () => { try {
  await test("GET verifies token/mode and returns exact plain-text challenge", async () => {
    const r = await setup().GET(get({ "hub.mode": "subscribe", "hub.verify_token": env.WHATSAPP_WEBHOOK_VERIFY_TOKEN, "hub.challenge": "0012345" }));
    assert.equal(r.status, 200); assert.equal(await r.text(), "0012345"); assert(r.headers.get("content-type").startsWith("text/plain"));
  });
  await test("GET rejects missing/wrong/duplicate fields and unsafe challenges", async () => {
    const valid = { "hub.mode": "subscribe", "hub.verify_token": env.WHATSAPP_WEBHOOK_VERIFY_TOKEN, "hub.challenge": "123" };
    for (const bad of [{ "hub.mode": "other" }, { "hub.verify_token": "wrong" }, { "hub.challenge": "<script>" }, { "hub.challenge": "" }]) assert.equal((await setup().GET(get({ ...valid, ...bad }))).status, 403);
    assert.equal((await setup().GET(get({}))).status, 403);
    assert.equal((await setup().GET(new Request(get(valid).url + '&hub.mode=subscribe'))).status, 403);
    delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN; assert.equal((await setup().GET(get(valid))).status, 503);
  });
  await test("Missing, invalid, wrong-secret and changed-body signatures reject before DB", async () => {
    const { POST, db } = setup();
    for (const signature of [null, "sha256=oops", "sha256=" + "0".repeat(64)]) assert.equal((await POST(post(payload(), { signature }))).status, 401);
    assert.equal((await POST(post(payload(), { secret: "wrong" }))).status, 401);
    const r = post(payload()); const signature = r.headers.get("x-hub-signature-256");
    assert.equal((await POST(post(JSON.stringify(payload()) + ' ', { signature }))).status, 401); assert.equal(db.writes, 0);
  });
  await test("Valid signature processes delivery and timestamp", async () => {
    const { POST, db } = setup(); assert.equal((await POST(post(payload()))).status, 200);
    assert.equal(db.tables.notification_deliveries[0].status, "DELIVERED"); assert.equal(db.tables.notification_deliveries[0].delivered_at, new Date(1700000002000).toISOString());
  });
  await test("Duplicate webhooks are no-op and earliest stage timestamp is stable", async () => {
    const { POST, db } = setup(); await POST(post(payload())); const n = db.writes;
    await POST(post(payload())); await POST(post(payload([event('delivered','1700000003')]))); assert.equal(db.writes, n);
    await POST(post(payload([event('delivered','1700000001')]))); assert.equal(db.tables.notification_deliveries[0].delivered_at, new Date(1700000001000).toISOString());
  });
  await test("Out-of-order READ then SENT/DELIVERED/FAILED never downgrades", async () => {
    const { POST, db } = setup(); for (const s of ['read','sent','delivered','failed']) assert.equal((await POST(post(payload([event(s)])))).status, 200);
    const row = db.tables.notification_deliveries[0]; assert.equal(row.status, 'READ'); assert(row.sent_at && row.delivered_at && row.read_at); assert.equal(row.error_message, null);
  });
  await test("FAILED beats late SENT; DELIVERED/READ override failure evidence", async () => {
    const { POST, db } = setup(); await POST(post(payload([event('failed','1700000002',{ errors: [{ code: 131026, title: env.WHATSAPP_APP_SECRET }] })])));
    assert.equal(db.tables.notification_deliveries[0].status,'FAILED'); assert.equal(db.tables.notification_deliveries[0].error_message,'meta_error_131026 at 2023-11-14T22:13:22.000Z');
    await POST(post(payload([event('sent')]))); assert.equal(db.tables.notification_deliveries[0].status,'FAILED');
    await POST(post(payload())); assert.equal(db.tables.notification_deliveries[0].status,'DELIVERED'); assert.equal(db.tables.notification_deliveries[0].error_message,null);
  });
  await test("Parallel read/delivered/sent events preserve all timestamps and READ", async () => {
    const { POST, db } = setup(); const results = await Promise.all(['read','sent','delivered'].map((s) => POST(post(payload([event(s)])))));
    assert(results.every((r) => r.status === 200)); const row = db.tables.notification_deliveries[0]; assert.equal(row.status,'READ'); assert(row.sent_at && row.delivered_at && row.read_at);
  });
  await test("Unknown IDs acknowledged without mutation", async () => {
    const { POST, db } = setup(); assert.equal((await POST(post(payload([event('read','1700000002',{id:'wamid.unknown'})])))).status,200); assert.equal(db.writes,0);
  });
  await test("Early receipt while test send is in flight returns retryable 503", async () => {
    const { POST, db } = setup({ deliveries: [], outboxes: [{...outbox,status:'CANCELLED'}] }); assert.equal((await POST(post(payload()))).status,503); assert.equal(db.writes,0);
    db.tables.notification_deliveries.push(structuredClone(delivery));
    assert.equal((await POST(post(payload()))).status,200);assert.equal(db.tables.notification_deliveries[0].status,'DELIVERED');
  });
  await test("Foreign accounts/senders/recipients, other providers and production outboxes untouched", async () => {
    for (const options of [{outboxes:[{...outbox,event_type:'BOOKING'}]}, {outboxes:[{...outbox,payload:{test:false}}]}, {deliveries:[{...delivery,provider:'EMAIL'}]}]) {
      const {POST,db}=setup(options); assert.equal((await POST(post(payload()))).status,200); assert.equal(db.writes,0);
    }
    for (const kind of ['account','phone','recipient']) { const p=payload(); if(kind==='account')p.entry[0].id='other'; if(kind==='phone')p.entry[0].changes[0].value.metadata.phone_number_id='other'; if(kind==='recipient')p.entry[0].changes[0].value.statuses[0].recipient_id='41790000000'; const {POST,db}=setup(); assert.equal((await POST(post(p))).status,200);assert.equal(db.writes,0); }
  });
  await test("Unsupported events/inbound messages ignored without replies or DB writes", async () => {
    const p=payload();delete p.entry[0].changes[0].value.statuses;p.entry[0].changes[0].value.messages=[{text:{body:env.WHATSAPP_APP_SECRET}}];
    for(const value of [p,{object:'other'},payload([event('deleted')])]){const {POST,db}=setup();assert.equal((await POST(post(value))).status,200);assert.equal(db.writes,0);}
  });
  await test("Signed malformed JSON/shapes/timestamps/IDs reject with no partial writes", async () => {
    for(const p of ['{',null,[],{}, {object:'whatsapp_business_account',entry:{}},payload([event('read','not-a-time')]),payload([event('read','999999999999')]),payload([event('read','1700000002',{id:'invalid'})]),payload([event('sent'),event('read','bad')])]){const {POST,db}=setup();assert.equal((await POST(post(p))).status,400);assert.equal(db.writes,0);}
    assert.equal((await setup().POST(post('x'.repeat(262145)))).status,413);
  });
  await test("Missing webhook secret or scope configuration fails closed", async () => {
    delete process.env.WHATSAPP_APP_SECRET;assert.equal((await setup().POST(post(payload()))).status,503);Object.assign(process.env,env);
    delete process.env.WHATSAPP_PHONE_NUMBER_ID; assert.equal((await setup().POST(post(payload()))).status,503);
  });
  await test("Database errors return retryable status; duplicate IDs never update ambiguously",async()=>{
    for(const options of [{failRead:true},{failWrite:true},{deliveries:[delivery,{...delivery,id:'second'}]}]){const {POST,db}=setup(options);assert.equal((await POST(post(payload()))).status,503);assert.equal(db.writes,0);}
  });
  await test("Outbox created before send uses schema-safe test-only non-queued record",async()=>{
    const {deliveries,db}=setup({deliveries:[],outboxes:[]});const id=await deliveries.prepareWhatsAppTest('41791234567');const row=db.tables.notification_outbox[0];assert.equal(row.status,'CANCELLED');assert.equal(row.event_type,'WHATSAPP_TEST');assert.equal(row.channel,'WHATSAPP');assert.equal(row.payload.test,true);assert(!row.appointment_id&&!row.customer_id);assert.equal(await deliveries.recordWhatsAppTest(id,'wamid.test'),true);assert.equal(db.tables.notification_outbox[0].status,'COMPLETED');assert.equal(db.tables.notification_deliveries[0].outbox_id,id);
  });
  await test("Persistence failure returns false without enqueueing; failed send stays terminal",async()=>{
    const {deliveries,db}=setup({failWrite:true});assert.equal(await deliveries.recordWhatsAppTest('outbox','wamid.test'),false);assert.equal(db.tables.notification_outbox[0].status,'COMPLETED');
    const pending=setup({outboxes:[{...outbox,status:'CANCELLED'}]});await pending.deliveries.failWhatsAppTest('outbox');assert.equal(pending.db.tables.notification_outbox[0].status,'FAILED');
  });
  await test("Delivery INSERT followed by outbox completion failure retains tracking without requeue",async()=>{
    const {deliveries,db}=setup({deliveries:[],outboxes:[{...outbox,status:'CANCELLED'}],failOutboxComplete:true});
    assert.equal(await deliveries.recordWhatsAppTest('outbox','wamid.synthetic'),false);
    assert.equal(db.tables.notification_deliveries.length,1);assert.equal(db.tables.notification_deliveries[0].provider_message_id,'wamid.synthetic');
    assert.equal(db.tables.notification_outbox[0].status,'CANCELLED');
  });
  assert(!warnings.join(' ').includes(env.WHATSAPP_APP_SECRET));assert(!warnings.join(' ').includes(env.WHATSAPP_WEBHOOK_VERIFY_TOKEN));console.log(`PASS ${passed} webhook tests; no live DB mutations, provider requests or messages.`);
}finally{console.warn=warn;for(const[k,v]of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}})().catch(e=>{console.error(e);process.exitCode=1;});
