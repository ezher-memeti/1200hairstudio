import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

function loadEnv(path) {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnv(".env.local");
const applicationUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
loadEnv(".env.test.local");
const testUrl = process.env.SUPABASE_TEST_URL?.replace(/\/$/, "");
const anonKey = process.env.SUPABASE_TEST_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
if (!testUrl || !anonKey || !serviceKey) throw new Error("Missing isolated Supabase test credentials.");
const linkedRef = existsSync("supabase/.temp/project-ref") ? readFileSync("supabase/.temp/project-ref", "utf8").trim() : "";
const linkedAuthorization = process.env.SUPABASE_TEST_LINKED_PROJECT_AUTHORIZATION === `ALLOW_PHASE_1_3_TESTING:${linkedRef}`;
const usingCurrentDatabase = Boolean(applicationUrl && testUrl === applicationUrl);
if (usingCurrentDatabase && !linkedAuthorization) throw new Error("REFUSING TO RUN: the test URL matches the application database without project-specific authorization.");
if (process.env.SUPABASE_SERVICE_ROLE_KEY && serviceKey === process.env.SUPABASE_SERVICE_ROLE_KEY && !linkedAuthorization) throw new Error("REFUSING TO RUN: the test service-role key matches the application credential.");
const host = new URL(testUrl).hostname;
const isLocal = ["localhost", "127.0.0.1", "host.docker.internal"].includes(host);
if (!isLocal && process.env.SECURITY_TEST_ALLOW_REMOTE !== "YES_I_UNDERSTAND_TEST_DATA_ONLY") {
  throw new Error("REFUSING TO RUN against a remote project without the disposable-test-project opt-in.");
}
if (!isLocal) {
  const expectedRef = process.env.SUPABASE_TEST_PROJECT_REF?.trim();
  const actualRef = host.endsWith(".supabase.co") ? host.slice(0, -".supabase.co".length) : "";
  if (!expectedRef || actualRef !== expectedRef) throw new Error("REFUSING TO RUN: remote test hostname does not match SUPABASE_TEST_PROJECT_REF.");
  if (actualRef === linkedRef && !linkedAuthorization) throw new Error("REFUSING TO RUN: remote test project matches the repository-linked project without project-specific authorization.");
}

const admin = createClient(testUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const anonymous = createClient(testUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const marker = `SECURITY_TEST_${randomUUID()}`;
const guestEmail = `${marker.toLowerCase()}-guest@example.invalid`;
const registeredEmail = `${marker.toLowerCase()}-registered@example.invalid`;
const customerIds = [];
const appointmentIds = [];

function assert(value, message) { if (!value) throw new Error(message); }
function pass(message) { console.log(`✓ ${message}`); }

async function cleanup() {
  if (appointmentIds.length) await admin.from("appointments").delete().in("id", appointmentIds);
  if (customerIds.length) await admin.from("customers").delete().in("id", customerIds);
}

try {
  const first = await admin.rpc("get_or_create_guest_customer", {
    p_full_name: `${marker} Original`, p_email: guestEmail, p_phone: "111", p_marketing_consent: false,
  });
  if (first.error) throw first.error;
  customerIds.push(first.data);
  const second = await admin.rpc("get_or_create_guest_customer", {
    p_full_name: `${marker} Attacker`, p_email: guestEmail.toUpperCase(), p_phone: "999", p_marketing_consent: true,
  });
  if (second.error) throw second.error;
  assert(second.data === first.data, "Existing guest was not reused.");
  const guest = await admin.from("customers").select("full_name,phone,marketing_email_consent").eq("id", first.data).single();
  if (guest.error) throw guest.error;
  assert(guest.data.full_name === `${marker} Original` && guest.data.phone === "111" && guest.data.marketing_email_consent === false, "Existing guest data was mutated.");
  pass("guest identity reuse does not mutate customer data");

  const registered = await admin.from("customers").insert({ full_name: `${marker} Registered`, email: registeredEmail, phone: "222", is_registered: true }).select("id").single();
  if (registered.error) throw registered.error;
  customerIds.push(registered.data.id);
  const registeredResolution = await admin.rpc("get_or_create_guest_customer", {
    p_full_name: `${marker} Attacker`, p_email: registeredEmail, p_phone: "999", p_marketing_consent: true,
  });
  assert(registeredResolution.error?.code === "42501", "Registered customer email was not rejected.");
  const unchanged = await admin.from("customers").select("full_name,phone,marketing_email_consent").eq("id", registered.data.id).single();
  assert(unchanged.data?.full_name === `${marker} Registered` && unchanged.data.phone === "222" && unchanged.data.marketing_email_consent === false, "Registered customer data was mutated.");
  pass("guest booking cannot reuse or modify a registered customer");

  const denied = await anonymous.rpc("get_or_create_guest_customer", {
    p_full_name: marker, p_email: `${marker.toLowerCase()}-denied@example.invalid`, p_phone: "333", p_marketing_consent: false,
  });
  assert(Boolean(denied.error), "Anonymous caller unexpectedly executed the server-only RPC.");
  pass("anonymous RPC execution is denied");

  const service = await admin.from("services").select("id,price").eq("is_active", true).limit(1).maybeSingle();
  if (service.error || !service.data) throw service.error ?? new Error("No active service is available for the concurrency test.");
  const startAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const endAt = new Date(new Date(startAt).getTime() + 30 * 60 * 1000).toISOString();
  const makeInsert = (suffix) => admin.from("appointments").insert({
    customer_id: first.data, service_id: service.data.id, start_at: startAt, end_at: endAt,
    status: "confirmed", booking_source: "customer", customer_name: marker,
    customer_email: guestEmail, customer_phone: "111", guest_name: marker,
    guest_email: guestEmail, guest_phone: "111", original_price: service.data.price,
    discount_amount: 0, final_price: service.data.price,
    booking_reference: `${marker}-${suffix}`, manage_token_hash: randomUUID().replaceAll("-", ""), notes: marker,
  }).select("id").single();
  const concurrent = await Promise.all([makeInsert("A"), makeInsert("B")]);
  for (const response of concurrent) if (response.data?.id) appointmentIds.push(response.data.id);
  const successes = concurrent.filter((response) => !response.error);
  const conflicts = concurrent.filter((response) => response.error?.code === "23P01");
  assert(successes.length === 1 && conflicts.length === 1, `Expected one success and one 23P01 conflict; got ${JSON.stringify(concurrent.map((r) => r.error?.code ?? "success"))}`);
  pass("concurrent overlapping appointments are rejected atomically");
} finally {
  await cleanup();
}
