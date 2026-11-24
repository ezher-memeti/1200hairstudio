import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

function loadEnv(path) {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const at = line.indexOf("=");
    if (at < 1) continue;
    const key = line.slice(0, at).trim();
    let value = line.slice(at + 1).trim();
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
if (applicationUrl && testUrl === applicationUrl && !linkedAuthorization) throw new Error("REFUSING TO RUN against the application database without project-specific authorization.");
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

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(testUrl, serviceKey, options);
const anonymous = createClient(testUrl, anonKey, options);
const marker = `AUTHZ_TEST_${randomUUID()}`;
const password = `T3st-${randomUUID()}!`;
const ids = { users: [], customers: [], appointments: [], services: [], storage: [] };
const pass = (message) => console.log(`✓ ${message}`);
const assert = (value, message) => { if (!value) throw new Error(message); };

async function createUser(email, role, guestFirst = false) {
  let guestId = null;
  if (guestFirst) {
    const guest = await service.from("customers").insert({ full_name: `${marker} Guest`, email, phone: "111", notes: `${marker} protected` }).select("id").single();
    if (guest.error) throw guest.error;
    guestId = guest.data.id;
    ids.customers.push(guestId);
  }
  const created = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `${marker} User`, phone: "222" } });
  if (created.error || !created.data.user) throw created.error ?? new Error("User creation failed.");
  ids.users.push(created.data.user.id);
  if (role === "admin") {
    const profile = await service.from("profiles").upsert({ id: created.data.user.id, role: "admin" });
    if (profile.error) throw profile.error;
  }
  const signedIn = createClient(testUrl, anonKey, options);
  const login = await signedIn.auth.signInWithPassword({ email, password });
  if (login.error) throw login.error;
  const profile = await service.from("profiles").select("role").eq("id", created.data.user.id).maybeSingle();
  assert(profile.data?.role === role, `Auth trigger/profile role mismatch for ${role}.`);
  if (role === "customer") {
    const customer = await service.from("customers").select("id,profile_id,is_registered,notes").eq("profile_id", created.data.user.id).single();
    if (customer.error) throw customer.error;
    if (!ids.customers.includes(customer.data.id)) ids.customers.push(customer.data.id);
    assert(customer.data.is_registered === true, "Auth trigger did not mark the customer registered.");
    if (guestFirst) assert(customer.data.id === guestId && customer.data.notes === `${marker} protected`, "Auth signup did not safely claim the guest row.");
    return { client: signedIn, userId: created.data.user.id, customerId: customer.data.id };
  }
  return { client: signedIn, userId: created.data.user.id, customerId: null };
}

async function cleanup() {
  for (const item of ids.storage) await service.storage.from(item.bucket).remove([item.path]);
  if (ids.appointments.length) await service.from("appointments").delete().in("id", ids.appointments);
  if (ids.services.length) await service.from("services").delete().in("id", ids.services);
  if (ids.customers.length) await service.from("customers").delete().in("id", ids.customers);
  for (const userId of ids.users.reverse()) await service.auth.admin.deleteUser(userId);
}

try {
  const customerOne = await createUser(`${marker.toLowerCase()}-one@example.invalid`, "customer", true);
  const customerTwo = await createUser(`${marker.toLowerCase()}-two@example.invalid`, "customer");
  const admin = await createUser(`${marker.toLowerCase()}-admin@example.invalid`, "admin");
  pass("Auth signup trigger creates and safely claims customer records");

  const ownProjection = await customerOne.client.rpc("get_my_customer");
  const own = Array.isArray(ownProjection.data) ? ownProjection.data[0] : ownProjection.data;
  assert(!ownProjection.error && own?.id === customerOne.customerId && !("notes" in own), "Safe customer projection failed or exposed notes.");
  const rawCustomer = await customerOne.client.from("customers").select("*").eq("id", customerOne.customerId);
  assert(!rawCustomer.error && rawCustomer.data.length === 0, "Customer could directly select the protected customer row.");
  pass("customer projection excludes admin-only fields and direct row reads are denied");

  const hostileUpdate = await customerOne.client.from("customers").update({ notes: "attacker", is_registered: false, profile_id: customerTwo.userId }).eq("id", customerOne.customerId).select("id");
  assert(hostileUpdate.error || hostileUpdate.data.length === 0, "Customer directly updated protected fields.");
  const protectedRow = await service.from("customers").select("notes,is_registered,profile_id").eq("id", customerOne.customerId).single();
  assert(protectedRow.data?.notes === `${marker} protected` && protectedRow.data.is_registered && protectedRow.data.profile_id === customerOne.userId, "Protected customer fields changed.");
  const profileUpdate = await customerOne.client.rpc("update_my_customer_profile", { p_full_name: `${marker} Updated`, p_phone: "333" });
  if (profileUpdate.error) throw profileUpdate.error;
  const updated = await service.from("customers").select("full_name,phone,notes").eq("id", customerOne.customerId).single();
  assert(updated.data?.full_name === `${marker} Updated` && updated.data.phone === "333" && updated.data.notes === `${marker} protected`, "Trusted profile update changed the wrong fields.");
  pass("trusted profile operation updates only permitted fields");

  const consent = await customerOne.client.rpc("set_my_marketing_email_preference", { p_subscribed: true, p_source: "account_preferences" });
  if (consent.error) throw consent.error;
  const consentRow = await service.from("customers").select("marketing_email_consent,marketing_email_consent_source,marketing_email_consented_at").eq("id", customerOne.customerId).single();
  assert(consentRow.data?.marketing_email_consent && consentRow.data.marketing_email_consent_source === "account_preferences" && consentRow.data.marketing_email_consented_at, "Consent RPC did not preserve auditable state.");
  pass("marketing consent is changed through the constrained RPC");

  const createdService = await service.from("services").insert({ name: marker, price: 50, duration_min: 30, duration_max: 30, is_active: false }).select("id").single();
  if (createdService.error) throw createdService.error;
  ids.services.push(createdService.data.id);
  const publicInactive = await anonymous.from("services").select("id").eq("id", createdService.data.id);
  assert(!publicInactive.error && publicInactive.data.length === 0, "Temporary services policy still exposes inactive services.");
  const adminInactive = await admin.client.from("services").select("id").eq("id", createdService.data.id).single();
  assert(adminInactive.data?.id === createdService.data.id, "Admin cannot read inactive services.");
  pass("public sees only active services while admin access remains intact");

  const appointment = await service.from("appointments").insert({ customer_id: customerOne.customerId, service_id: createdService.data.id, start_at: new Date(Date.now() + 400 * 86400000).toISOString(), end_at: new Date(Date.now() + 400 * 86400000 + 1800000).toISOString(), status: "confirmed", booking_source: "customer", original_price: 50, discount_amount: 0, final_price: 50, booking_reference: `${marker}-owned`, manage_token_hash: randomUUID().replaceAll("-", "") }).select("id").single();
  if (appointment.error) throw appointment.error;
  ids.appointments.push(appointment.data.id);
  const ownAppointment = await customerOne.client.from("appointments").select("id").eq("id", appointment.data.id);
  const otherAppointment = await customerTwo.client.from("appointments").select("id").eq("id", appointment.data.id);
  assert(ownAppointment.data?.length === 1 && otherAppointment.data?.length === 0, "Appointment ownership RLS failed.");
  const directInsert = await customerOne.client.from("appointments").insert({ customer_id: customerOne.customerId, service_id: createdService.data.id, start_at: new Date(Date.now() + 401 * 86400000).toISOString(), end_at: new Date(Date.now() + 401 * 86400000 + 1800000).toISOString(), status: "confirmed" });
  assert(Boolean(directInsert.error), "Customer bypassed the server booking operation.");
  pass("appointment reads are owner-only and direct writes are denied");

  const [anonPromotionRpc, anonLegacyBooking, anonCheckout] = await Promise.all([
    anonymous.rpc("get_my_available_promotions", { p_service_id: createdService.data.id }),
    anonymous.rpc("create_guest_appointment", { p_customer_id: customerOne.customerId, p_service_id: createdService.data.id, p_start_at: new Date().toISOString(), p_end_at: new Date(Date.now() + 1800000).toISOString(), p_customer_name: marker, p_customer_email: "x@example.invalid", p_customer_phone: "1" }),
    anonymous.rpc("complete_pos_checkout", { p_appointment_id: appointment.data.id, p_subtotal: 50, p_discount_amount: 0, p_discount_source: null, p_discount_type: null, p_discount_value: null, p_discount_reason: null, p_promotion_id: null, p_loyalty_reward_id: null, p_loyalty_discount: 0, p_tip_amount: 0, p_tax_amount: 0, p_total: 50, p_payments: [] }),
  ]);
  assert(anonPromotionRpc.error && anonLegacyBooking.error && anonCheckout.error, "Anonymous RPC execution grants remain too broad.");
  pass("sensitive and identity-scoped RPCs reject anonymous callers");

  const listed = await service.storage.listBuckets();
  if (listed.error) throw listed.error;
  for (const bucket of ["service-images", "selected-work-images"]) {
    assert(listed.data.some((candidate) => candidate.id === bucket), `Required Storage bucket is missing: ${bucket}`);
    const path = `${marker}/${randomUUID()}.png`;
    const imageBytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const customerUpload = await customerOne.client.storage.from(bucket).upload(path, imageBytes, { contentType: "image/png" });
    assert(Boolean(customerUpload.error), `Customer could upload to ${bucket}.`);
    const adminUpload = await admin.client.storage.from(bucket).upload(path, imageBytes, { contentType: "image/png" });
    if (adminUpload.error) throw new Error(`Admin storage write failed for ${bucket}: ${adminUpload.error.message}`);
    ids.storage.push({ bucket, path });
  }
  pass("configured image buckets deny customer writes and preserve admin writes");
} finally {
  await cleanup();
}
