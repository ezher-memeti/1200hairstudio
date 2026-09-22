import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export const APPOINTMENT_FINANCIAL_HISTORY_MESSAGE =
  "This appointment cannot be permanently deleted because it has financial records. Keep it for reporting and auditing; use the existing refund flow to reverse a paid or checked-out appointment.";

export function isAppointmentForeignKeyError(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === "23503" || /foreign key constraint|still referenced/i.test(error?.message ?? "");
}

export async function getProtectedAppointmentIds(supabase: SupabaseClient, appointmentIds: string[]) {
  const protectedIds = new Set<string>();
  if (!appointmentIds.length) return protectedIds;

  const [paymentResult, saleResult, receiptResult, loyaltyVisitResult, loyaltyRewardResult] = await Promise.all([
    supabase.from("payments").select("appointment_id").in("appointment_id", appointmentIds),
    supabase.from("sales").select("appointment_id").in("appointment_id", appointmentIds),
    supabase.from("receipts").select("appointment_id").in("appointment_id", appointmentIds),
    supabase.from("loyalty_visits").select("appointment_id").in("appointment_id", appointmentIds),
    supabase.from("loyalty_rewards").select("redeemed_appointment_id").in("redeemed_appointment_id", appointmentIds),
  ]);

  const failures = [
    ["payments", paymentResult.error], ["sales", saleResult.error], ["receipts", receiptResult.error],
    ["loyalty visits", loyaltyVisitResult.error], ["loyalty rewards", loyaltyRewardResult.error],
  ].filter((entry) => entry[1]);
  if (failures.length) {
    console.error("APPOINTMENT DELETION PROTECTION LOOKUP ERROR:", Object.fromEntries(failures));
    throw new Error("Unable to verify whether this appointment has protected financial history.");
  }

  for (const row of paymentResult.data ?? []) if (row.appointment_id) protectedIds.add(row.appointment_id);
  for (const row of saleResult.data ?? []) if (row.appointment_id) protectedIds.add(row.appointment_id);
  for (const row of receiptResult.data ?? []) if (row.appointment_id) protectedIds.add(row.appointment_id);
  for (const row of loyaltyVisitResult.data ?? []) if (row.appointment_id) protectedIds.add(row.appointment_id);
  for (const row of loyaltyRewardResult.data ?? []) if (row.redeemed_appointment_id) protectedIds.add(row.redeemed_appointment_id);
  return protectedIds;
}
