// Explicitly authorized delivery-pipeline tests. Does not invoke booking/payment UI actions.
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const { randomUUID, createHash } = require("node:crypto");
const assert = require("node:assert/strict");
const ts = require("typescript");
const { createClient } = require("@supabase/supabase-js");

const recipient = process.env.GMAIL_TEST_RECIPIENT?.trim();
if (!recipient || process.env.GMAIL_DELIVERY_TEST_AUTHORIZATION !== `SEND_DISPOSABLE_TESTS:${recipient}`) {
  throw new Error("An explicitly authorized recipient is required.");
}
const root = path.resolve(__dirname, "..");
const marker = `GMAIL-VERIFY-${randomUUID()}`;
const reportPath = process.env.GMAIL_TEST_REPORT_PATH;
if (!reportPath || !path.isAbsolute(reportPath)) throw new Error("An absolute report path is required.");
if (fs.existsSync(reportPath)) throw new Error("Report already exists; refusing to repeat a delivery run.");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const modules = new Map();
function load(filename) {
  filename = path.resolve(filename);
  if (modules.has(filename)) return modules.get(filename).exports;
  const module = { exports: {} };
  modules.set(filename, module);
  const localRequire = createRequire(filename);
  function scopedRequire(name) {
    if (name === "server-only") return {};
    if (name === "react") return { ...localRequire(name), cache: (fn) => fn }; // No React request cache in a CLI run.
    if (name === "@/lib/auth/customer") return {}; // Settings' unused admin-action dependency.
    if (name.startsWith("@/")) {
      const target = path.join(root, "src", name.slice(2));
      return load(fs.existsSync(`${target}.ts`) ? `${target}.ts` : path.join(target, "index.ts"));
    }
    return localRequire(name);
  }
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function("require", "module", "exports", compiled)(scopedRequire, module, module.exports);
  return module.exports;
}
const report = { marker, startedAt: new Date().toISOString(), recipient, scope: "Real Gmail submission through application email functions and real disposable appointment/log rows; booking UI, payment checkout, and cron execution are not exercised.", scenarios: [], cleanup: {}, existingData: {} };
const owned = [];
const snapshotTables = ["appointments", "customers", "payments", "sales", "sale_items", "receipts", "recurring_bookings", "appointment_reminders", "customer_email_logs", "admin_settings", "notification_settings"];
const before = new Map();
const hash = (row) => createHash("sha256").update(JSON.stringify(row)).digest("hex");
async function rows(table) {
  const all = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db.from(table).select("*").order("id").range(offset, offset + 499);
    if (error) throw new Error(`Snapshot failed for ${table} (${error.code}).`);
    all.push(...data);
    if (data.length < 500) return all;
  }
}
async function fixture(service, index) {
  // Cancelled fixtures cannot reserve customer slots or be picked up by reminders.
  const start = new Date(Date.now() + (14 + index) * 86400000);
  const data = { id: randomUUID(), service_id: service.id, customer_id: null, customer_name: `${marker} ${index}`, customer_email: recipient, customer_phone: "0000000000", guest_name: `${marker} ${index}`, guest_email: recipient, guest_phone: "0000000000", booking_source: "customer", start_at: start.toISOString(), end_at: new Date(+start + service.duration_min * 60000).toISOString(), status: "cancelled", original_price: service.price, discount_amount: 0, final_price: service.price, booking_reference: `${marker}-${index}`, manage_token_hash: createHash("sha256").update(randomUUID()).digest("hex"), notes: marker };
  const { error } = await db.from("appointments").insert(data);
  if (error) { console.log(JSON.stringify({ fixtureErrorCode: error.code })); throw new Error(`Fixture insert failed (${error.code}).`); }
  owned.push(data);
  return data;
}
async function scenario(name, expectedType, appointment, send) {
  const checkpoint = hash((await db.from("appointments").select("*").eq("id", appointment.id).single()).data);
  let submissionError = null;
  try { await send(); } catch { submissionError = "Submission failed; inspect sanitized email log status."; }
  let lookup = db.from("customer_email_logs").select("id,email_type,status,provider_message_id,error_message");
  lookup = appointment.detached ? lookup.eq("metadata->>booking_reference", appointment.booking_reference).eq("recipient_email", recipient) : lookup.eq("appointment_id", appointment.id);
  const { data: logs, error } = await lookup;
  if (error) throw new Error(`Log verification failed (${error.code}).`);
  const result = { name, expectedType, acceptedByGmail: logs.length === 1 && logs[0].status === "sent" && !!logs[0].provider_message_id, inboxConfirmed: false, logCount: logs.length, logStatus: logs[0]?.status ?? "missing", providerMessageId: logs[0]?.provider_message_id ?? null, submissionError };
  assert.equal(hash((await db.from("appointments").select("*").eq("id", appointment.id).single()).data), checkpoint, "Email send altered appointment.");
  assert.equal(logs[0]?.email_type, expectedType);
  report.scenarios.push(result);
  console.log(JSON.stringify(result));
}
async function main() {
  for (const table of snapshotTables) before.set(table, new Map((await rows(table)).map((row) => [row.id, hash(row)])));
  const runtime = load(path.join(root, "src/lib/admin/runtime-settings.ts"));
  const settings = await runtime.getRuntimeSettings();
  report.notificationSettings = settings.notifications;
  const { data: services, error } = await db.from("services").select("id,name,price,duration_min").eq("is_active", true).limit(1);
  if (error || !services?.length) throw new Error("No active service available.");
  const service = services[0];
  const gmail = load(path.join(root, "src/lib/email/gmail.ts"));
  const recurring = load(path.join(root, "src/lib/email/recurring.ts"));
  const reminder = load(path.join(root, "src/lib/email/reminder.ts"));
  const receiptEmail = load(path.join(root, "src/lib/email/receipt.ts"));
  const receipts = load(path.join(root, "src/lib/receipts/server.ts"));
  let index = 0;
  async function run(name, type, enabled, sender) {
    if (process.env.GMAIL_TEST_SCENARIO === "cancellation" && type !== "appointment_cancelled") return;
    if (!enabled) { report.scenarios.push({ name, acceptedByGmail: false, inboxConfirmed: false, skipped: "Notification disabled" }); return; }
    const a = await fixture(service, index++);
    const details = { to: recipient, appointmentId: a.id, customerName: a.customer_name, serviceName: service.name, startAt: a.start_at, endAt: a.end_at, price: Number(service.price), bookingReference: a.booking_reference, manageUrl: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/#booking` };
    if (process.env.GMAIL_TEST_SCENARIO === "cancellation") {
      const deletion = await db.from("appointments").delete().eq("id", a.id).eq("notes", marker);
      if (deletion.error) throw new Error("Test cancellation deletion failed.");
      a.detached = true;
      delete details.appointmentId;
    }
    await scenario(name, type, a, () => sender(details, a));
  }
  await run("New customer confirmation (email pipeline)", "appointment_confirmation", settings.notifications.bookingConfirmationEmail, (d) => gmail.sendBookingConfirmationEmail(d));
  await run("Guest confirmation (email pipeline)", "appointment_confirmation", settings.notifications.bookingConfirmationEmail, (d) => gmail.sendBookingConfirmationEmail(d));
  await run("Rescheduling (email pipeline)", "appointment_rescheduled", settings.notifications.rescheduleEmail, (d) => gmail.sendBookingUpdateEmail(d));
  await run("Cancellation (email pipeline)", "appointment_cancelled", settings.notifications.cancellationEmail, (d) => gmail.sendBookingCancellationEmail(d));
  await run("Recurring summary (email pipeline)", "regular_booking_confirmation", settings.notifications.bookingConfirmationEmail, async (d, a) => {
    // Recurring logs use a series metadata key rather than an appointment FK.
    const original = gmail.sendCustomerEmail;
    gmail.sendCustomerEmail = (message) => original({ ...message, appointmentId: a.id });
    try { await recurring.sendRecurringBookingConfirmationEmail({ ...d, frequency: "weekly", weekday: 1, startTime: "10:00", startsOn: a.start_at.slice(0, 10), endsOn: a.start_at.slice(0, 10), reservedCount: 1, upcomingAppointments: [{ startAt: a.start_at }] }); }
    finally { gmail.sendCustomerEmail = original; }
  });
  const reminderSettings = await db.from("notification_settings").select("appointment_reminders_enabled,appointment_reminder_email_enabled").limit(1).single();
  if (reminderSettings.error) throw new Error("Reminder settings unavailable.");
  await run("Reminder (email pipeline)", "appointment_reminder", reminderSettings.data.appointment_reminders_enabled && reminderSettings.data.appointment_reminder_email_enabled, (d) => reminder.sendAppointmentReminderEmail({ ...d, registeredCustomer: false }));
  await run("Receipt with PDF (email pipeline)", "receipt", settings.notifications.receiptEmailEnabled, async (d, a) => {
    const now = new Date().toISOString();
    // In-memory receipt avoids modifying financial records or receipt sequences.
    const receipt = { id: randomUUID(), appointment_id: a.id, receipt_number: 0, customer_name: a.customer_name, service_name: `${marker} — ${service.name}`, service_quantity: 1, appointment_start_at: a.start_at, subtotal: Number(service.price), discount_amount: 0, total: Number(service.price), tip_amount: 0, tax_amount: 0, amount_paid: Number(service.price), balance: 0, payment_method: "other", currency: "CHF", issued_at: now, created_at: now, emailed_at: null, created_by: null, discount_label: "Disposable delivery test; not a financial receipt" };
    await receiptEmail.sendReceiptEmail({ to: recipient, customerName: a.customer_name, receipt, pdf: await receipts.generateReceiptPdf(receipt) });
  });
}
async function cleanup() {
  for (const a of owned) {
    let lookup = db.from("customer_email_logs").select("id").eq("recipient_email", recipient);
    lookup = a.detached ? lookup.eq("metadata->>booking_reference", a.booking_reference) : lookup.eq("appointment_id", a.id);
    const { data, error } = await lookup;
    if (error) throw new Error("Cleanup log ownership lookup failed.");
    for (const log of data) {
      let deletion = db.from("customer_email_logs").delete().eq("id", log.id).eq("recipient_email", recipient);
      deletion = a.detached ? deletion.eq("metadata->>booking_reference", a.booking_reference) : deletion.eq("appointment_id", a.id);
      const result = await deletion;
      if (result.error) throw new Error("Test log cleanup failed.");
    }
    const result = await db.from("appointments").delete().eq("id", a.id).eq("notes", marker).eq("customer_email", recipient);
    if (result.error) throw new Error("Test appointment cleanup failed.");
  }
  report.cleanup = { appointmentsCreated: owned.length, noFinancialRowsCreated: true };
  for (const [table, snapshot] of before) {
    const after = new Map((await rows(table)).map((row) => [row.id, hash(row)]));
    const unchanged = [...snapshot].every(([id, digest]) => after.get(id) === digest);
    const exactRowSet = snapshot.size === after.size && [...after.keys()].every((id) => snapshot.has(id));
    report.existingData[table] = { unchanged, exactRowSet };
    if (!unchanged || !exactRowSet) process.exitCode = 1;
  }
}
(async () => {
  try { await main(); } catch (error) { report.failure = "Verification stopped; detailed exceptions suppressed to protect credentials."; report.failureLocations = String(error.stack ?? "").split("\n").slice(1).filter((line) => line.includes(root) || line.includes("<anonymous>")).slice(0, 5); console.log(JSON.stringify({ failureLocations: report.failureLocations })); process.exitCode = 1; }
  finally {
    try { await cleanup(); } catch { report.cleanupFailure = "Cleanup incomplete; review test marker and owned appointment IDs."; report.ownedAppointmentIds = owned.map((a) => a.id); process.exitCode = 1; }
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify({ reportPath, marker, cleanup: report.cleanup, existingData: report.existingData, failure: report.failure, cleanupFailure: report.cleanupFailure }));
    if (report.scenarios.some((s) => !s.acceptedByGmail && !s.skipped)) process.exitCode = 1;
  }
})();
