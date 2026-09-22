import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

function loadEnv(path, overwrite = false) {
  if (!existsSync(path)) return;
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (overwrite || process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnv(".env.local");
const applicationUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
loadEnv(".env.test.local");

const testUrl = process.env.SUPABASE_TEST_URL?.replace(/\/$/, "");
const testAnonKey = process.env.SUPABASE_TEST_PUBLISHABLE_KEY;
const testServiceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
if (!testUrl || !testAnonKey || !testServiceKey) throw new Error("Missing SUPABASE_TEST_URL, SUPABASE_TEST_PUBLISHABLE_KEY, or SUPABASE_TEST_SERVICE_ROLE_KEY. Copy .env.test.example to .env.test.local.");
const usingCurrentDatabase = Boolean(applicationUrl && testUrl === applicationUrl);
if (usingCurrentDatabase && process.env.POS_TEST_ALLOW_CURRENT_DB !== "YES_I_UNDERSTAND") throw new Error("REFUSING TO RUN: SUPABASE_TEST_URL matches the normal application database URL. To explicitly authorize temporary development testing, set POS_TEST_ALLOW_CURRENT_DB=YES_I_UNDERSTAND.");
const testHost = new URL(testUrl).hostname;
const isLocal = ["localhost", "127.0.0.1", "host.docker.internal"].includes(testHost);
if (!isLocal && !usingCurrentDatabase && process.env.POS_TEST_ALLOW_REMOTE !== "YES_I_UNDERSTAND_TEST_DATA_ONLY") throw new Error("REFUSING TO RUN against a remote project. Use a disposable test project and set POS_TEST_ALLOW_REMOTE=YES_I_UNDERSTAND_TEST_DATA_ONLY.");

const prefix = `POS_TEST_${randomUUID()}`;
const password = `T3st-${randomUUID()}!`;
const adminEmail = `${prefix.toLowerCase()}-admin@example.invalid`;
const customerEmail = `${prefix.toLowerCase()}-customer@example.invalid`;
const admin = createClient(testUrl, testServiceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const client = createClient(testUrl, testAnonKey, { auth: { autoRefreshToken: false, persistSession: false } });
const ids = { user: null, customer: null, appointments: [], sales: [], saleItems: [], payments: [], receipts: [], rewards: [], loyaltyVisits: [], movements: [], register: null };

const money = (value) => Math.round(Number(value ?? 0) * 100) / 100;
function fail(operation, expected, actual) { throw new Error(`${operation}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`); }
function equal(actual, expected, operation) { if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(operation, expected, actual); }
function ok(value, operation) { if (!value) fail(operation, true, value); }
function pass(message) { console.log(`✓ ${message}`); }
function result(data, error, operation) { if (error) throw new Error(`${operation}: ${error.code ?? "UNKNOWN"} ${error.message}`); return data; }
function addUniqueIds(target, rows) { for (const row of rows ?? []) if (row.id && !target.includes(row.id)) target.push(row.id); }

async function openRegister() {
  const existingResponse = await client.from("register_sessions").select("id,opening_note").eq("status", "open").limit(1);
  const existing = result(existingResponse.data, existingResponse.error, "Check open register");
  if (existing.length) throw new Error("Test environment already has an open register. Close it before running this isolated test.");
  const response = await client.from("register_sessions").insert({ opened_by: ids.user, opening_cash: 100, status: "open", opening_note: prefix }).select("*").single();
  return result(response.data, response.error, "Open register");
}

async function movement(type, amount) {
  const session = await client.from("register_sessions").select("id").eq("id", ids.register).eq("status", "open").maybeSingle();
  result(session.data, session.error, `Validate ${type}`);
  if (!session.data) return { error: "closed" };
  const response = await client.from("register_movements").insert({ register_session_id: ids.register, type, amount, note: prefix, created_by: ids.user }).select("*").single();
  const data = result(response.data, response.error, `Create ${type}`);
  ids.movements.push(data.id);
  return { data, error: null };
}

async function checkout(appointmentId, values) {
  const response = await client.rpc("complete_pos_checkout", {
    p_appointment_id: appointmentId, p_subtotal: values.subtotal, p_discount_amount: values.discount ?? 0,
    p_discount_source: values.discount ? "manual" : null, p_discount_type: values.discount ? "fixed" : null,
    p_discount_value: values.discount ?? null, p_discount_reason: values.discount ? prefix : null,
    p_loyalty_reward_id: values.rewardId ?? null, p_loyalty_discount: 0, p_tip_amount: values.tip ?? 0,
    p_tax_amount: 0, p_total: values.total, p_payments: values.payments,
  });
  const saleId = result(response.data, response.error, values.label);
  ids.sales.push(saleId);
  const [saleResponse, paymentsResponse, appointmentResponse] = await Promise.all([
    admin.from("sales").select("*").eq("id", saleId).single(),
    admin.from("payments").select("*").eq("sale_id", saleId).order("paid_at"),
    admin.from("appointments").select("status,original_price,discount_amount,final_price").eq("id", appointmentId).single(),
  ]);
  const sale = result(saleResponse.data, saleResponse.error, `${values.label} persisted sale`);
  const payments = result(paymentsResponse.data, paymentsResponse.error, `${values.label} persisted payments`);
  const appointment = result(appointmentResponse.data, appointmentResponse.error, `${values.label} persisted appointment`);
  ids.payments.push(...payments.map((payment) => payment.id));
  const itemsResponse = await admin.from("sale_items").select("id").eq("sale_id", saleId);
  addUniqueIds(ids.saleItems, result(itemsResponse.data, itemsResponse.error, `${values.label} persisted sale items`));
  equal(money(sale.subtotal), values.subtotal, `${values.label} subtotal`);
  equal(money(sale.discount_amount), values.discount ?? 0, `${values.label} discount`);
  equal(money(sale.tip_amount), values.tip ?? 0, `${values.label} tip`);
  equal(money(sale.total), values.total, `${values.label} total`);
  equal(money(payments.reduce((sum, payment) => sum + money(payment.amount), 0)), money(values.total + (values.tip ?? 0)), `${values.label} payment total`);
  equal(appointment.status, "completed", `${values.label} appointment status`);
  equal(money(appointment.original_price), values.subtotal, `${values.label} appointment original price`);
  equal(money(appointment.final_price), values.total, `${values.label} appointment final price`);
  return { sale, payments, appointment };
}

async function registerTotals() {
  const [sessionResponse, movementResponse, paymentResponse] = await Promise.all([
    admin.from("register_sessions").select("*").eq("id", ids.register).single(),
    admin.from("register_movements").select("type,amount").eq("register_session_id", ids.register),
    admin.from("payments").select("transaction_type,amount,tip_amount,payment_method").eq("register_session_id", ids.register).eq("status", "completed"),
  ]);
  const session = result(sessionResponse.data, sessionResponse.error, "Load register session");
  const movements = result(movementResponse.data, movementResponse.error, "Load register movements");
  const payments = result(paymentResponse.data, paymentResponse.error, "Load register payments");
  const cashPayments = payments.filter((payment) => payment.transaction_type === "payment" && payment.payment_method === "cash").reduce((sum, payment) => sum + money(payment.amount), 0);
  const cashRefunds = payments.filter((payment) => payment.transaction_type === "refund" && payment.payment_method === "cash").reduce((sum, payment) => sum + money(payment.amount), 0);
  const cashIn = movements.filter((item) => item.type === "deposit").reduce((sum, item) => sum + money(item.amount), 0);
  const cashOut = movements.filter((item) => item.type === "withdrawal").reduce((sum, item) => sum + money(item.amount), 0);
  return { session, movements, payments, cashPayments, cashRefunds, cashIn, cashOut, expected: money(session.opening_cash + cashPayments + cashIn - cashOut - cashRefunds) };
}

async function cleanup() {
  const problems = [];
  const addIds = (target, rows) => { for (const row of rows ?? []) if (row.id && !target.includes(row.id)) target.push(row.id); };
  const discover = async (table, target, column, values) => {
    if (!values.length) return;
    const response = await admin.from(table).select("id").in(column, values);
    if (response.error) problems.push({ table, id: values.join(","), reason: `discovery failed: ${response.error.message}` });
    else addIds(target, response.data);
  };
  await discover("sales", ids.sales, "appointment_id", ids.appointments);
  await discover("receipts", ids.receipts, "appointment_id", ids.appointments);
  await discover("payments", ids.payments, "sale_id", ids.sales);
  await discover("sale_items", ids.saleItems, "sale_id", ids.sales);
  if (ids.register) await discover("register_movements", ids.movements, "register_session_id", [ids.register]);
  if (ids.customer) {
    await discover("loyalty_visits", ids.loyaltyVisits, "customer_id", [ids.customer]);
    await discover("loyalty_rewards", ids.rewards, "customer_id", [ids.customer]);
  }

  const exactDelete = async (table, id, owns) => {
    const loaded = await admin.from(table).select("*").eq("id", id).maybeSingle();
    if (loaded.error) { problems.push({ table, id, reason: `ownership lookup failed: ${loaded.error.message}` }); return; }
    if (!loaded.data) return;
    if (!owns(loaded.data)) { problems.push({ table, id, reason: "ownership verification failed; record was not deleted" }); return; }
    const deleted = await admin.from(table).delete().eq("id", id);
    if (deleted.error) problems.push({ table, id, reason: deleted.error.message });
  };

  const paymentRows = ids.payments.length ? await admin.from("payments").select("id,transaction_type").in("id", ids.payments) : { data: [], error: null };
  if (paymentRows.error) problems.push({ table: "payments", id: ids.payments.join(","), reason: paymentRows.error.message });
  const orderedPaymentIds = [...(paymentRows.data ?? [])].sort((a, b) => Number(a.transaction_type !== "refund") - Number(b.transaction_type !== "refund")).map((row) => row.id);
  for (const id of ids.receipts) await exactDelete("receipts", id, (row) => ids.appointments.includes(row.appointment_id));
  for (const id of ids.loyaltyVisits) await exactDelete("loyalty_visits", id, (row) => row.customer_id === ids.customer && ids.appointments.includes(row.appointment_id));
  for (const id of orderedPaymentIds) await exactDelete("payments", id, (row) => ids.sales.includes(row.sale_id) && ids.appointments.includes(row.appointment_id));
  for (const id of ids.saleItems) await exactDelete("sale_items", id, (row) => ids.sales.includes(row.sale_id));
  for (const id of ids.sales) await exactDelete("sales", id, (row) => ids.appointments.includes(row.appointment_id) && row.customer_id === ids.customer);
  for (const id of ids.rewards) await exactDelete("loyalty_rewards", id, (row) => row.customer_id === ids.customer);
  for (const id of ids.movements) await exactDelete("register_movements", id, (row) => row.register_session_id === ids.register && row.note === prefix && row.created_by === ids.user);
  if (ids.register) await exactDelete("register_sessions", ids.register, (row) => row.opening_note === prefix && row.opened_by === ids.user);
  for (const id of ids.appointments) await exactDelete("appointments", id, (row) => row.customer_id === ids.customer && row.notes === prefix && String(row.booking_reference ?? "").startsWith(prefix));
  if (ids.customer) await exactDelete("customers", ids.customer, (row) => row.full_name === prefix && row.email === customerEmail);
  if (ids.user) {
    const authUser = await admin.auth.admin.getUserById(ids.user);
    if (authUser.error) problems.push({ table: "auth.users", id: ids.user, reason: `ownership lookup failed: ${authUser.error.message}` });
    else if (authUser.data.user?.email !== adminEmail) problems.push({ table: "auth.users", id: ids.user, reason: "ownership verification failed; user was not deleted" });
    else {
      await exactDelete("profiles", ids.user, (row) => row.id === ids.user);
      const removed = await admin.auth.admin.deleteUser(ids.user);
      if (removed.error) problems.push({ table: "auth.users", id: ids.user, reason: removed.error.message });
    }
  }

  const verifyGone = async (table, recordIds) => {
    for (const id of recordIds) {
      const response = await admin.from(table).select("id").eq("id", id).maybeSingle();
      if (response.error) problems.push({ table, id, reason: `verification failed: ${response.error.message}` });
      else if (response.data) problems.push({ table, id, reason: "record still exists after cleanup" });
    }
  };
  await verifyGone("receipts", ids.receipts);
  await verifyGone("payments", ids.payments);
  await verifyGone("sale_items", ids.saleItems);
  await verifyGone("sales", ids.sales);
  await verifyGone("loyalty_visits", ids.loyaltyVisits);
  await verifyGone("loyalty_rewards", ids.rewards);
  await verifyGone("register_movements", ids.movements);
  await verifyGone("register_sessions", ids.register ? [ids.register] : []);
  await verifyGone("appointments", ids.appointments);
  await verifyGone("customers", ids.customer ? [ids.customer] : []);
  if (ids.user) {
    const authCheck = await admin.auth.admin.getUserById(ids.user);
    if (!authCheck.error && authCheck.data.user) problems.push({ table: "auth.users", id: ids.user, reason: "test auth user still exists after cleanup" });
  }
  if (problems.length) {
    console.error("\nCLEANUP: FAILED");
    for (const problem of problems) console.error(`✗ ${problem.table} ${problem.id}: ${problem.reason}`);
    process.exitCode = 1;
  } else console.log("\n✓ Cleanup verification passed — 0 test records remaining");
}

if (usingCurrentDatabase) {
  console.warn("\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
  console.warn("WARNING: POS/CASSA TEST IS USING THE CURRENT APPLICATION DATABASE");
  console.warn(`Only records owned by this run will be touched: ${prefix}`);
  console.warn("Explicit override accepted: POS_TEST_ALLOW_CURRENT_DB=YES_I_UNDERSTAND");
  console.warn("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n");
}

try {
  console.log(`POS/CASSA TEST RUN: ${prefix}`);
  const userResponse = await admin.auth.admin.createUser({ email: adminEmail, password, email_confirm: true });
  ids.user = result(userResponse.data.user, userResponse.error, "Create test admin").id;
  const profileResponse = await admin.from("profiles").upsert({ id: ids.user, role: "admin" }, { onConflict: "id" });
  result(profileResponse.data, profileResponse.error, "Create admin profile");
  const signIn = await client.auth.signInWithPassword({ email: adminEmail, password });
  result(signIn.data.session, signIn.error, "Sign in test admin");

  const customerResponse = await admin.from("customers").insert({ profile_id: null, full_name: prefix, email: customerEmail, phone: "+41000000000", is_registered: false }).select("id").single();
  ids.customer = result(customerResponse.data, customerResponse.error, "Create test customer").id;
  const servicesResponse = await admin.from("services").select("id,name,price,duration_min").in("name", ["Hair", "Kid", "Hair + Beard"]);
  const services = result(servicesResponse.data, servicesResponse.error, "Load test services");
  const byName = new Map(services.map((service) => [service.name, service]));
  for (const [name, price] of [["Hair", 25], ["Kid", 20], ["Hair + Beard", 35]]) equal(money(byName.get(name)?.price), price, `${name} service seed price`);

  const base = Date.now() + 30 * 86_400_000;
  const serviceNames = ["Hair", "Hair", "Kid", "Hair + Beard", "Hair + Beard"];
  for (let index = 0; index < serviceNames.length; index += 1) {
    const service = byName.get(serviceNames[index]);
    const start = new Date(base + index * 3_600_000);
    const appointmentResponse = await admin.from("appointments").insert({ customer_id: ids.customer, service_id: service.id, booking_source: "admin", customer_name: prefix, customer_email: customerEmail, customer_phone: "+41000000000", start_at: start.toISOString(), end_at: new Date(start.getTime() + Number(service.duration_min) * 60_000).toISOString(), status: "confirmed", notes: prefix, guest_name: null, guest_email: null, guest_phone: null, original_price: money(service.price), discount_amount: 0, final_price: money(service.price), promotion_id: null, discount_source: null, discount_label: null, discount_type: null, discount_value: null, booking_reference: `${prefix}-${index}`, manage_token_hash: randomUUID().replaceAll("-", "") }).select("id").single();
    ids.appointments.push(result(appointmentResponse.data, appointmentResponse.error, `Create appointment ${index + 1}`).id);
  }

  const rewardResponse = await admin.from("loyalty_rewards").insert({ customer_id: ids.customer, reward_type: "fixed_discount", reward_value: 0, status: "available", earned_at: new Date().toISOString() }).select("id").single();
  ids.rewards.push(result(rewardResponse.data, rewardResponse.error, "Create idempotency loyalty reward").id);

  const register = await openRegister(); ids.register = register.id; equal(money(register.opening_cash), 100, "Register opening cash"); pass("Register opened: CHF 100");
  await checkout(ids.appointments[0], { label: "Cash checkout", subtotal: 25, total: 25, rewardId: ids.rewards[0], payments: [{ method: "cash", amount: 25, tipAmount: 0, cashReceived: 25, changeGiven: 0 }] }); pass("Cash checkout: CHF 25");
  const tipped = await checkout(ids.appointments[1], { label: "Cash plus tip checkout", subtotal: 25, total: 25, tip: 5, payments: [{ method: "cash", amount: 30, tipAmount: 5, cashReceived: 30, changeGiven: 0 }] }); equal(money(tipped.payments[0].tip_amount), 5, "Persisted payment tip"); pass("Cash + tip checkout: CHF 30");
  const twint = await checkout(ids.appointments[2], { label: "TWINT checkout", subtotal: 20, total: 20, payments: [{ method: "twint", amount: 20, tipAmount: 0 }] }); equal(twint.payments[0].register_session_id, null, "TWINT register exclusion"); pass("TWINT excluded from cash register");
  const card = await checkout(ids.appointments[3], { label: "Discounted card checkout", subtotal: 35, discount: 5, total: 30, payments: [{ method: "card", amount: 30, tipAmount: 0 }] }); equal(card.payments[0].register_session_id, null, "Card register exclusion"); equal(money(card.appointment.discount_amount), 5, "Appointment discount snapshot"); pass("Card excluded from cash register");
  const split = await checkout(ids.appointments[4], { label: "Split checkout", subtotal: 35, total: 35, payments: [{ method: "cash", amount: 20, tipAmount: 0, cashReceived: 20, changeGiven: 0 }, { method: "twint", amount: 15, tipAmount: 0 }] }); equal(split.payments.length, 2, "Split payment record count"); equal(new Set(split.payments.map((payment) => payment.sale_id)).size, 1, "Split payments sale association"); pass("Split payment correct");

  const duplicateBefore = await admin.from("payments").select("id", { count: "exact", head: true }).in("appointment_id", ids.appointments);
  const duplicate = await client.rpc("complete_pos_checkout", { p_appointment_id: ids.appointments[0], p_subtotal: 25, p_discount_amount: 0, p_discount_source: null, p_discount_type: null, p_discount_value: null, p_discount_reason: null, p_loyalty_reward_id: null, p_loyalty_discount: 0, p_tip_amount: 0, p_tax_amount: 0, p_total: 25, p_payments: [{ method: "cash", amount: 25, tipAmount: 0, cashReceived: 25, changeGiven: 0 }] });
  ok(duplicate.error, "Duplicate checkout must fail");
  const duplicateAfter = await admin.from("payments").select("id", { count: "exact", head: true }).in("appointment_id", ids.appointments);
  equal(duplicateAfter.count, duplicateBefore.count, "Duplicate checkout payment count"); pass("Duplicate checkout rejected");
  const saleCount = await admin.from("sales").select("id", { count: "exact", head: true }).in("appointment_id", ids.appointments); result(saleCount.data, saleCount.error, "Count test sales"); equal(saleCount.count, 5, "No duplicate sale created");
  const rewardCheck = await admin.from("loyalty_rewards").select("status,redeemed_appointment_id").eq("id", ids.rewards[0]).single(); equal(result(rewardCheck.data, rewardCheck.error, "Load loyalty reward"), { status: "redeemed", redeemed_appointment_id: ids.appointments[0] }, "Loyalty redeemed exactly once");

  await movement("deposit", 50); pass("Cash In: CHF 50");
  await movement("withdrawal", 20); pass("Cash Out: CHF 20");
  const refundResponse = await client.rpc("refund_pos_sale", { p_sale_id: ids.sales[0], p_amount: 10, p_method: "cash", p_note: prefix });
  const refundId = result(refundResponse.data, refundResponse.error, "Cash refund"); ids.payments.push(refundId);
  const refundRecord = await admin.from("payments").select("transaction_type,amount,refunded_payment_id,register_session_id").eq("id", refundId).single();
  const persistedRefund = result(refundRecord.data, refundRecord.error, "Persisted refund"); equal(persistedRefund.transaction_type, "refund", "Refund transaction type"); equal(money(persistedRefund.amount), 10, "Refund amount"); ok(persistedRefund.refunded_payment_id, "Refund link"); equal(persistedRefund.register_session_id, ids.register, "Cash refund register association"); pass("Refund: CHF 10");
  const overflow = await client.rpc("refund_pos_sale", { p_sale_id: ids.sales[0], p_amount: 16, p_method: "cash", p_note: prefix }); ok(overflow.error, "Refund overflow must fail"); pass("Refund overflow rejected");

  const totals = await registerTotals(); equal(totals.cashPayments, 75, "Cash payments including tip and split portion"); equal(totals.cashRefunds, 10, "Cash refunds"); equal(totals.cashIn, 50, "Cash in"); equal(totals.cashOut, 20, "Cash out"); equal(totals.expected, 195, "Expected physical cash");
  const allSalesResponse = await admin.from("sales").select("subtotal,discount_amount,tip_amount,total").in("id", ids.sales); const allSales = result(allSalesResponse.data, allSalesResponse.error, "Load sales totals"); equal(money(allSales.reduce((sum, sale) => sum + money(sale.total), 0)), 135, "Sales revenue excludes movements and tips"); equal(money(allSales.reduce((sum, sale) => sum + money(sale.tip_amount), 0)), 5, "Tips stored separately"); pass("Expected cash: CHF 195");

  const closeResponse = await client.from("register_sessions").update({ expected_cash: 195, actual_cash: 195, difference: 0, closed_at: new Date().toISOString(), closed_by: ids.user, status: "closed", closing_note: prefix }).eq("id", ids.register).eq("status", "open").select("*").maybeSingle();
  const closed = result(closeResponse.data, closeResponse.error, "Close register"); ok(closed, "First register close"); equal(money(closed.expected_cash), 195, "Closed expected cash"); equal(money(closed.actual_cash), 195, "Counted cash"); equal(money(closed.difference), 0, "Register difference"); equal(closed.status, "closed", "Register status"); pass("Counted cash: CHF 195"); pass("Difference: CHF 0"); pass("Register closed");
  const movementCountBefore = await admin.from("register_movements").select("id", { count: "exact", head: true }).eq("register_session_id", ids.register); result(movementCountBefore.data, movementCountBefore.error, "Count movements before closed attempt");
  const closedMovement = await movement("deposit", 1); equal(closedMovement.error, "closed", "Closed register movement rejection");
  const movementCountAfter = await admin.from("register_movements").select("id", { count: "exact", head: true }).eq("register_session_id", ids.register); result(movementCountAfter.data, movementCountAfter.error, "Count movements after closed attempt"); equal(movementCountAfter.count, movementCountBefore.count, "Closed register persisted movement count");
  const secondClose = await client.from("register_sessions").update({ actual_cash: 195 }).eq("id", ids.register).eq("status", "open").select("id").maybeSingle(); result(secondClose.data, secondClose.error, "Second close attempt"); equal(secondClose.data, null, "Closed register second close protection"); pass("Closed register protections passed");
  console.log("\nPOS/CASSA TEST: PASSED");
} catch (error) {
  console.error(`\nPOS/CASSA TEST: FAILED\n${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await cleanup();
  await client.auth.signOut();
}
