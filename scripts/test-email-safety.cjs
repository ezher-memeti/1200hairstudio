const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
function load(relative, mocks) {
  const source = ts.transpileModule(fs.readFileSync(path.join(root, relative), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  const scoped = (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name === "server-only") return {};
    if (name.startsWith("@/")) return {}; // Unused dependencies of the isolated action.
    return require(name);
  };
  new Function("require", "module", "exports", source)(scoped, module, module.exports);
  return module.exports;
}
function database(initial) {
  const tables = structuredClone(initial);
  const writes = [];
  const db = { tables, writes, auth: { getUser: async () => ({ data: { user: { id: "admin" } }, error: null }) }, from(table) {
    let operation = "select", payload, single = false, memo;
    const filters = [];
    const query = {
      select() { return query; }, eq(k, v) { filters.push((r) => r[k] === v); return query; },
      in(k, values) { filters.push((r) => values.includes(r[k])); return query; },
      match(values) { for (const [k, v] of Object.entries(values)) query.eq(k, v); return query; },
      gte() { return query; }, lt() { return query; }, lte() { return query; }, order() { return query; }, limit() { return query; },
      update(value) { operation = "update"; payload = value; return query; },
      insert(value) { operation = "insert"; payload = value; return query; },
      delete() { operation = "delete"; return query; },
      single() { single = true; return query; }, maybeSingle() { single = true; return query; },
      then(resolve, reject) {
        if (!memo) memo = Promise.resolve().then(() => {
          const rows = tables[table] ?? (tables[table] = []);
          let selected = rows.filter((r) => filters.every((fn) => fn(r)));
          if (operation === "insert") {
            if (table === "customer_email_logs" && payload.appointment_id && !tables.appointments?.some((r) => r.id === payload.appointment_id)) return { data: null, error: { code: "23503" } };
            if (table === "appointment_reminders" && rows.some((r) => r.appointment_id === payload.appointment_id && r.appointment_start_at === payload.appointment_start_at && r.channel === payload.channel)) return { data: null, error: { code: "23505" } };
            const row = { id: `new-${rows.length}`, ...payload }; rows.push(row); selected = [row];
          }
          if (operation === "update") for (const row of selected) Object.assign(row, payload);
          if (operation === "delete") tables[table] = rows.filter((r) => !selected.includes(r));
          if (operation !== "select") writes.push(table);
          return { data: single ? structuredClone(selected[0] ?? null) : structuredClone(selected), error: null };
        });
        return memo.then(resolve, reject);
      },
    };
    return query;
  } };
  return db;
}
const appointment = { id: "appointment", customer_id: null, customer_name: "Disposable", customer_email: "test@example.invalid", service_id: "service", start_at: "2026-12-01T10:00:00Z", end_at: "2026-12-01T10:30:00Z", status: "confirmed", booking_reference: "DISPOSABLE", original_price: 25, final_price: 25 };
const service = { id: "service", name: "Test", price: 25 };
const results = [];
async function test(name, fn) { await fn(); results.push(name); console.log(`PASS ${name}`); }

(async () => {
  const originalError = console.error;
  const captured = [];
  console.error = (...args) => captured.push(args.map((v) => v instanceof Error ? v.message : JSON.stringify(v)).join(" "));
  try {
    for (const enabled of [false, true]) {
      await test(`Admin actions respect global settings (${enabled ? "enabled" : "disabled"})`, async () => {
        const db = database({ profiles: [{ id: "admin", role: "admin" }], appointments: [appointment], services: [service] });
        const sent = [];
        const settings = { bookingConfirmationEmail: enabled, rescheduleEmail: enabled, cancellationEmail: enabled };
        const actions = load("src/app/actions/appointments.ts", {
          "next/cache": { revalidatePath() {} },
          "@/lib/supabase/server": { createClient: async () => db },
          "@/lib/admin/runtime-settings": { getNotificationSettings: async () => settings },
          "@/lib/appointments/mutations": { validateAppointmentRequest: async () => ({ service, startAt: "2026-12-02T10:00:00Z", endAt: "2026-12-02T10:30:00Z" }) },
          "@/lib/appointments/deletion-protection": { getProtectedAppointmentIds: async () => new Set(), isAppointmentForeignKeyError: () => false },
          "@/lib/email/transactional": {
            sendBookingUpdateEmail: async (d) => sent.push(["reschedule", d]),
            sendBookingCancellationEmail: async (d) => { assert.equal(d.appointmentId, undefined, "Deleted appointment must not remain an email-log FK"); assert.equal(d.bookingReference, "DISPOSABLE"); sent.push(["cancel", d]); },
            sendBookingConfirmationEmail: async (d) => sent.push(["confirmation", d]),
          },
          "@/lib/appointments/management": { createBookingCredentials: () => ({ bookingReference: "NEW", managementTokenHash: "HASH", managementToken: "synthetic" }), getBookingManagementUrl: () => "https://example.invalid" },
          "@/lib/customers/mutations": { resolveCustomerByEmail: async () => ({ id: "new-customer" }) },
        });
        assert.equal((await actions.updateAdminAppointment({ appointmentId: "appointment", serviceId: "service", dateKey: "2026-12-02", startTime: "10:00", sendNotification: true })).emailStatus, enabled ? "sent" : "skipped");
        assert.equal((await actions.removeAdminAppointment({ appointmentId: "appointment", sendNotification: true })).emailStatus, enabled ? "sent" : "skipped");
        assert.equal((await actions.createAdminAppointment({ customerId: null, customerName: "Test", customerEmail: "test@example.invalid", customerPhone: "0", serviceId: "service", dateKey: "2026-12-02", startTime: "10:00", notes: "test", sendConfirmationEmail: true })).emailStatus, enabled ? "sent" : "skipped");
        assert.equal(sent.length, enabled ? 3 : 0);
        assert(db.writes.every((table) => table === "appointments"));
      });
    }
    await test("Receipt disabled setting blocks PDF generation, sending, and writes", async () => {
      let called = false;
      const finance = load("src/app/actions/finance.ts", {
        "next/cache": { revalidatePath() {} },
        "@/lib/auth/customer": { requireAdminUser: async () => ({ supabase: {} }) },
        "@/lib/admin/runtime-settings": { getNotificationSettings: async () => ({ receiptEmailEnabled: false }) },
        "@/lib/email/receipt": { sendReceiptEmail: async () => { called = true; } },
        "@/lib/receipts/server": { getAdminReceipt: async () => { called = true; } },
      });
      assert.equal((await finance.resendAdminReceipt("test")).error, "Receipt emails are disabled.");
      assert.equal(called, false);
    });
    await test("Admin reschedule remains saved when email delivery fails", async () => {
      const db = database({ profiles: [{ id: "admin", role: "admin" }], appointments: [appointment], payments: [{ id: "payment", amount: 25 }] });
      const actions = load("src/app/actions/appointments.ts", {
        "next/cache": { revalidatePath() {} },
        "@/lib/supabase/server": { createClient: async () => db },
        "@/lib/admin/runtime-settings": { getNotificationSettings: async () => ({ rescheduleEmail: true }) },
        "@/lib/appointments/mutations": { validateAppointmentRequest: async () => ({ service, startAt: "2026-12-02T10:00:00Z", endAt: "2026-12-02T10:30:00Z" }) },
        "@/lib/email/transactional": { sendBookingUpdateEmail: async () => { throw new Error("Synthetic email failure"); } },
      });
      const result = await actions.updateAdminAppointment({ appointmentId: "appointment", serviceId: "service", dateKey: "2026-12-02", startTime: "10:00", sendNotification: true });
      assert.equal(result.error, null); assert.equal(result.emailStatus, "failed");
      assert.equal(db.tables.appointments[0].start_at, "2026-12-02T10:00:00Z");
      assert.deepEqual(db.tables.payments, [{ id: "payment", amount: 25 }]);
      assert.deepEqual(db.writes, ["appointments"]);
    });
    await test("Failed settings reads fail closed for email channels", async () => {
      const settings = load("src/lib/admin/settings.ts", {});
      const runtime = load("src/lib/admin/runtime-settings.ts", {
        react: { cache: (fn) => fn },
        "@/lib/admin/settings": settings,
        "@/lib/supabase/admin": { createAdminClient: () => { throw new Error("Synthetic settings read failure"); } },
      });
      const notifications = await runtime.getNotificationSettings();
      for (const key of ["bookingConfirmationEmail", "rescheduleEmail", "cancellationEmail", "receiptEmailEnabled", "adminBookingNotification"]) assert.equal(notifications[key], false);
    });
    await test("New booking and cancellation persist when their emails fail", async () => {
      const db = database({ profiles: [{ id: "admin", role: "admin" }], appointments: [appointment], services: [service], payments: [{ id: "payment", amount: 25 }] });
      const fail = async () => { throw new Error("Synthetic delivery failure"); };
      const actions = load("src/app/actions/appointments.ts", {
        "next/cache": { revalidatePath() {} },
        "@/lib/supabase/server": { createClient: async () => db },
        "@/lib/admin/runtime-settings": { getNotificationSettings: async () => ({ cancellationEmail: true, bookingConfirmationEmail: true }) },
        "@/lib/appointments/mutations": { validateAppointmentRequest: async () => ({ service, startAt: "2026-12-02T10:00:00Z", endAt: "2026-12-02T10:30:00Z" }) },
        "@/lib/appointments/deletion-protection": { getProtectedAppointmentIds: async () => new Set(), isAppointmentForeignKeyError: () => false },
        "@/lib/email/transactional": { sendBookingCancellationEmail: fail, sendBookingConfirmationEmail: fail },
        "@/lib/appointments/management": { createBookingCredentials: () => ({ bookingReference: "NEW", managementTokenHash: "HASH", managementToken: "synthetic" }), getBookingManagementUrl: () => "https://example.invalid" },
        "@/lib/customers/mutations": { resolveCustomerByEmail: async () => ({ id: "new-customer" }) },
      });
      const created = await actions.createAdminAppointment({ customerId: null, customerName: "Test", customerEmail: "test@example.invalid", customerPhone: "0", serviceId: "service", dateKey: "2026-12-02", startTime: "10:00", notes: "test", sendConfirmationEmail: true });
      assert.equal(created.error, null); assert.equal(created.emailStatus, "failed");
      assert.equal(db.tables.appointments.length, 2);
      const removed = await actions.removeAdminAppointment({ appointmentId: "appointment", sendNotification: true });
      assert.equal(removed.error, null); assert.equal(removed.emailStatus, "failed");
      assert.equal(db.tables.appointments.length, 1);
      assert.equal(db.tables.appointments[0].booking_reference, "NEW");
      assert.deepEqual(db.tables.payments, [{ id: "payment", amount: 25 }]);
      assert(db.writes.every((table) => table === "appointments"));
    });
    await test("Gmail failure logs contain no credential material and change no business rows", async () => {
      const db = database({ appointments: [appointment], payments: [{ id: "payment", amount: 25 }] });
      const before = JSON.stringify({ appointments: db.tables.appointments, payments: db.tables.payments });
      const secret = "SYNTHETIC-CREDENTIAL-MUST-NOT-ESCAPE";
      const gmail = load("src/lib/email/gmail.ts", {
        googleapis: { google: { auth: { OAuth2: class { setCredentials() {} } }, gmail: () => ({ users: { messages: { send: async () => { throw Object.assign(new Error(secret), { response: { status: 401, data: { secret } }, config: { headers: { Authorization: secret } } }); } } } }) } },
        "@/lib/supabase/admin": { createAdminClient: () => db },
        "@/lib/admin/runtime-settings": { getRuntimeSettings: async () => ({ notifications: { senderName: "Test" }, business: { businessName: "Test" } }) },
      });
      for (const key of ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"]) process.env[key] = secret;
      await assert.rejects(gmail.sendCustomerEmail({ to: "test@example.invalid", appointmentId: appointment.id, emailType: "other", subject: "Test", html: "Test", text: "Test" }), /Gmail message submission failed \(HTTP 401\)/);
      assert.equal(db.tables.customer_email_logs[0].status, "failed");
      assert.equal(db.tables.customer_email_logs[0].error_message.includes(secret), false);
      assert.equal(JSON.stringify({ appointments: db.tables.appointments, payments: db.tables.payments }), before);
      assert(db.writes.every((table) => table === "customer_email_logs"));
      assert.equal(captured.join("\n").includes(secret), false);
    });
    await test("Reminder endpoint rejects disabled notifications before appointment lookup or send", async () => {
      const db = database({ notification_settings: [{ appointment_reminders_enabled: false, appointment_reminder_email_enabled: true }] });
      let sent = false;
      const route = load("src/app/api/internal/appointment-reminder-email/route.ts", {
        "@/lib/supabase/admin": { createAdminClient: () => db },
        "@/lib/email/reminder": { sendAppointmentReminderEmail: async () => { sent = true; } },
      });
      process.env.REMINDER_DELIVERY_SECRET = "synthetic-test-secret";
      const { NextRequest } = require("next/server");
      const response = await route.POST(new NextRequest("http://localhost/api/internal/appointment-reminder-email", { method: "POST", headers: { authorization: "Bearer synthetic-test-secret", "content-type": "application/json" }, body: JSON.stringify({ appointmentId: "test", appointmentStartAt: appointment.start_at }) }));
      assert.equal(response.status, 409); assert.equal(sent, false); assert.equal(db.writes.length, 0);
    });
    await test("Reminder scheduler skips already-sent deliveries on rerun", async () => {
      const a = { ...appointment, start_at: new Date(Date.now() + 2 * 3600000 + 60000).toISOString() };
      const db = database({ notification_settings: [{ appointment_reminders_enabled: true, appointment_reminder_hours_before: 2, appointment_reminder_email_enabled: true }], appointments: [a], appointment_reminders: [] });
      let handler, sends = 0;
      const source = ts.transpileModule(fs.readFileSync(path.join(root, "supabase/functions/process-appointment-reminders/index.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
      const env = { APPOINTMENT_REMINDER_CRON_SECRET: "synthetic", SUPABASE_URL: "https://example.invalid", SUPABASE_SERVICE_ROLE_KEY: "synthetic", REMINDER_DELIVERY_URL: "https://example.invalid", REMINDER_DELIVERY_SECRET: "synthetic" };
      new Function("require", "exports", "Deno", "fetch", source)(() => ({ createClient: () => db }), {}, { env: { get: (name) => env[name] }, serve: (fn) => { handler = fn; } }, async () => { sends++; return new Response(JSON.stringify({ ok: true }), { status: 200 }); });
      const request = () => new Request("https://example.invalid", { headers: { "x-cron-secret": "synthetic" } });
      assert.equal((await (await handler(request())).json()).sent, 1);
      assert.equal((await (await handler(request())).json()).sent, 0);
      assert.equal(sends, 1);
      assert.equal(db.tables.appointment_reminders[0].status, "sent");
    });
  } finally { console.error = originalError; }
  console.log(`${results.length} email safety tests passed. External services and business records were not accessed.`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
