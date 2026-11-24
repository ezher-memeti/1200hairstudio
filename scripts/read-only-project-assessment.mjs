import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const raw of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const separator = raw.indexOf("=");
  if (separator < 1 || raw.trim().startsWith("#")) continue;
  const key = raw.slice(0, separator).trim();
  let value = raw.slice(separator + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
  process.env[key] ??= value;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const expectedRef = readFileSync("supabase/.temp/project-ref", "utf8").trim();
if (!url || !serviceKey || !publishableKey) throw new Error("Missing configured Supabase credentials.");
const actualRef = new URL(url).hostname.split(".")[0];
if (actualRef !== expectedRef) throw new Error("Configured URL does not match the repository-linked project.");

const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const anonymous = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
const tables = [
  "profiles", "customers", "appointments", "recurring_bookings", "recurring_booking_conflicts",
  "loyalty_settings", "loyalty_rewards", "loyalty_visits", "promotions", "promotion_customers",
  "sales", "sale_items", "payments", "receipts", "register_sessions", "register_movements",
  "financial_reports", "services", "selected_work", "business_hours", "availability_exceptions",
  "admin_settings", "notification_settings", "announcements", "homepage_content",
  "contact_section_settings", "marketing_templates", "marketing_campaigns",
  "marketing_campaign_recipients", "customer_email_logs", "appointment_reminders",
];

const counts = {};
for (const table of tables) {
  const { count, error } = await client.from(table).select("*", { count: "exact", head: true });
  counts[table] = error ? `ERROR:${error.code}` : count;
}

const { data: users, error: userError } = await client.auth.admin.listUsers({ page: 1, perPage: 1000 });
const { data: buckets, error: bucketError } = await client.storage.listBuckets();
const storage = [];
for (const bucket of buckets ?? []) {
  const { data, error } = await client.storage.from(bucket.id).list("", {
    limit: 1000,
    sortBy: { column: "name", order: "asc" },
  });
  storage.push({
    id: bucket.id,
    public: bucket.public,
    fileSizeLimit: bucket.file_size_limit,
    allowedMimeTypes: bucket.allowed_mime_types,
    rootEntries: error ? `ERROR:${error.message}` : data.length,
  });
}

const settingsResponse = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: publishableKey } });
if (!settingsResponse.ok) throw new Error(`Auth settings request failed: ${settingsResponse.status}`);
const settings = await settingsResponse.json();
const anonymousReadCounts = {};
for (const table of ["customers", "appointments", "loyalty_rewards", "loyalty_visits", "services", "selected_work", "sales", "payments", "receipts"]) {
  const { count, error } = await anonymous.from(table).select("*", { count: "exact", head: true });
  anonymousReadCounts[table] = error ? { denied: true, code: error.code } : { denied: false, count };
}

const requiredRows = async (table, columns) => {
  const { data, error } = await client.from(table).select(columns);
  if (error) throw new Error(`${table} assessment failed: ${error.message}`);
  return data;
};
const [customers, appointments, rewards, loyaltySettings, sales, payments, receipts, services, registerSessions] = await Promise.all([
  requiredRows("customers", "id,email,profile_id,is_registered"),
  requiredRows("appointments", "id,start_at,end_at,status,discount_source,discount_type,promotion_id"),
  requiredRows("loyalty_rewards", "id,customer_id,status,reward_type,reward_value,redeemed_appointment_id"),
  requiredRows("loyalty_settings", "id,reward_type,reward_value"),
  requiredRows("sales", "id,subtotal,discount_amount,loyalty_discount,tax_amount,total,discount_source,discount_type,loyalty_reward_id"),
  requiredRows("payments", "id,transaction_type,amount,tip_amount,payment_method,cash_received,change_given,status"),
  requiredRows("receipts", "id,subtotal,discount_amount,tax_amount,total,amount_paid,balance"),
  requiredRows("services", "id,name,price,duration_min,is_active"),
  requiredRows("register_sessions", "id,status"),
]);
const duplicateEmails = new Map();
for (const customer of customers) {
  const normalized = customer.email.trim().toLowerCase();
  duplicateEmails.set(normalized, (duplicateEmails.get(normalized) ?? 0) + 1);
}
const activeAppointments = appointments.filter((appointment) => appointment.status === "confirmed");
let overlappingConfirmedPairs = 0;
for (let left = 0; left < activeAppointments.length; left += 1) {
  for (let right = left + 1; right < activeAppointments.length; right += 1) {
    if (new Date(activeAppointments[left].start_at) < new Date(activeAppointments[right].end_at)
      && new Date(activeAppointments[right].start_at) < new Date(activeAppointments[left].end_at)) overlappingConfirmedPairs += 1;
  }
}
const redeemedLinks = new Map();
for (const reward of rewards) {
  if (!reward.redeemed_appointment_id) continue;
  redeemedLinks.set(reward.redeemed_appointment_id, (redeemedLinks.get(reward.redeemed_appointment_id) ?? 0) + 1);
}
const anomalyCounts = {
  legacyAppointmentDiscountValues: appointments.filter((row) => row.discount_source === "custom" || row.discount_type === "fixed_discount").length,
  invalidRewardValues: rewards.filter((row) => (row.reward_type === "free_service" && row.reward_value !== null)
    || (row.reward_type === "fixed_discount" && Number(row.reward_value ?? 0) <= 0)
    || (row.reward_type === "percentage" && (Number(row.reward_value ?? 0) <= 0 || Number(row.reward_value) > 100))).length,
  inconsistentSalesTotals: sales.filter((row) => Number(row.total) !== Math.max(0, Number(row.subtotal) - Number(row.discount_amount) - Number(row.loyalty_discount) + Number(row.tax_amount))).length,
  invalidPaymentTips: payments.filter((row) => Number(row.tip_amount) < 0 || Number(row.tip_amount) > Number(row.amount)).length,
  zeroTipRefunds: payments.filter((row) => row.transaction_type === "refund" && row.status === "completed" && Number(row.tip_amount) === 0).length,
  inconsistentReceiptTotals: receipts.filter((row) => Number(row.total) !== Math.max(0, Number(row.subtotal) - Number(row.discount_amount) + Number(row.tax_amount))
    || Number(row.balance) < 0 || Number(row.amount_paid) < 0).length,
};

console.log(JSON.stringify({
  projectRef: actualRef,
  counts,
  auth: { users: userError ? `ERROR:${userError.message}` : users.users.length },
  storage: bucketError ? `ERROR:${bucketError.message}` : storage,
  authSettings: { disableSignup: settings.disable_signup, externalProviders: settings.external },
  anonymousReadCounts,
  migrationPreconditions: {
    duplicateNormalizedCustomerEmails: [...duplicateEmails.values()].filter((count) => count > 1).length,
    overlappingConfirmedAppointmentPairs: overlappingConfirmedPairs,
    duplicateRewardRedemptionAppointments: [...redeemedLinks.values()].filter((count) => count > 1).length,
    loyaltySettingsRows: loyaltySettings.length,
    authUsersWithoutProfilesByCountOnly: Math.max(0, (userError ? 0 : users.users.length) - counts.profiles),
    openRegisterSessions: registerSessions.filter((row) => row.status === "open").length,
    posSeedServices: Object.fromEntries(["Hair", "Kid", "Hair + Beard"].map((name) => {
      const service = services.find((row) => row.name === name);
      return [name, service ? { price: Number(service.price), durationMinutes: service.duration_min, active: service.is_active } : null];
    })),
  },
  serviceCatalog: services.map((service) => ({
    name: service.name,
    price: Number(service.price),
    durationMinutes: service.duration_min,
    active: service.is_active,
  })),
  anomalyCounts,
}, null, 2));
