import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { LoyaltyRewardType } from "@/lib/loyalty/settings";

type LoyaltyProcessingResult = {
  processed: boolean;
  visitCreated: boolean;
  visitRestored: boolean;
  rewardCreated: boolean;
  reason: string | null;
};

const idleResult = (reason: string): LoyaltyProcessingResult => ({ processed: false, visitCreated: false, visitRestored: false, rewardCreated: false, reason });
const finiteInteger = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : fallback;
};

export async function processAppointmentStatusForLoyalty(appointmentId: string): Promise<LoyaltyProcessingResult> {
  const supabase = createAdminClient();
  const { data: appointment, error: appointmentError } = await supabase
    .from("appointments")
    .select("id,customer_id,status")
    .eq("id", appointmentId)
    .maybeSingle();

  if (appointmentError) throw new Error(`Unable to load appointment for loyalty: ${appointmentError.message}`);
  if (!appointment) return idleResult("appointment_not_found");

  const { data: existingVisit, error: existingVisitError } = await supabase
    .from("loyalty_visits")
    .select("id,is_eligible,reward_cycle")
    .eq("appointment_id", appointment.id)
    .maybeSingle();
  if (existingVisitError) throw new Error(`Unable to check loyalty visit: ${existingVisitError.message}`);

  if (appointment.status !== "completed") {
    if (!existingVisit) return idleResult("appointment_not_completed");
    if (!existingVisit.is_eligible) return idleResult("visit_already_ineligible");
    const { error } = await supabase.from("loyalty_visits").update({ is_eligible: false, excluded_reason: "appointment_status_changed" }).eq("id", existingVisit.id);
    if (error) throw new Error(`Unable to exclude loyalty visit: ${error.message}`);
    return { processed: true, visitCreated: false, visitRestored: false, rewardCreated: false, reason: "appointment_status_changed" };
  }

  if (!appointment.customer_id) return idleResult("missing_customer");
  const { data: customer, error: customerError } = await supabase.from("customers").select("id,profile_id").eq("id", appointment.customer_id).maybeSingle();
  if (customerError) throw new Error(`Unable to resolve loyalty customer: ${customerError.message}`);
  if (!customer) return idleResult("customer_not_found");

  if (customer.profile_id) {
    const { data: profile, error: profileError } = await supabase.from("profiles").select("role").eq("id", customer.profile_id).maybeSingle();
    if (profileError) throw new Error(`Unable to validate loyalty customer role: ${profileError.message}`);
    if (profile?.role === "admin") return idleResult("admin_customer");
  }

  const { data: settings, error: settingsError } = await supabase
    .from("loyalty_settings")
    .select("is_enabled,visits_required,reward_type,reward_value,reward_expiry_days")
    .limit(1)
    .maybeSingle();
  if (settingsError) throw new Error(`Unable to load loyalty settings: ${settingsError.message}`);
  if (!settings?.is_enabled) return idleResult("loyalty_disabled");

  const visitsRequired = finiteInteger(settings.visits_required, 10);
  const { data: customerVisits, error: visitsError } = await supabase
    .from("loyalty_visits")
    .select("id,appointment_id,is_eligible,reward_cycle")
    .eq("customer_id", customer.id);
  if (visitsError) throw new Error(`Unable to load customer loyalty visits: ${visitsError.message}`);

  let currentCycle = Math.max(1, ...(customerVisits ?? []).map((visit) => finiteInteger(visit.reward_cycle, 1)));
  const currentCycleEligible = (customerVisits ?? []).filter((visit) => visit.is_eligible && finiteInteger(visit.reward_cycle, 1) === currentCycle).length;
  let visitCreated = false;
  let visitRestored = false;

  if (existingVisit) {
    if (!existingVisit.is_eligible) {
      const { error } = await supabase.from("loyalty_visits").update({ is_eligible: true, excluded_reason: null }).eq("id", existingVisit.id);
      if (error) throw new Error(`Unable to restore loyalty visit: ${error.message}`);
      visitRestored = true;
      currentCycle = finiteInteger(existingVisit.reward_cycle, currentCycle);
    } else {
      currentCycle = finiteInteger(existingVisit.reward_cycle, currentCycle);
    }
  } else {
    if (currentCycleEligible >= visitsRequired) currentCycle += 1;
    const { error } = await supabase.from("loyalty_visits").insert({ customer_id: customer.id, appointment_id: appointment.id, is_eligible: true, excluded_reason: null, reward_cycle: currentCycle });
    if (error && error.code !== "23505") throw new Error(`Unable to create loyalty visit: ${error.message}`);
    visitCreated = !error;
  }

  const { data: cycleVisits, error: cycleError } = await supabase
    .from("loyalty_visits")
    .select("id")
    .eq("customer_id", customer.id)
    .eq("reward_cycle", currentCycle)
    .eq("is_eligible", true);
  if (cycleError) throw new Error(`Unable to count loyalty cycle visits: ${cycleError.message}`);
  if ((cycleVisits ?? []).length < visitsRequired) return { processed: true, visitCreated, visitRestored, rewardCreated: false, reason: null };

  const { count: rewardCount, error: rewardsError } = await supabase
    .from("loyalty_rewards")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", customer.id);
  if (rewardsError) throw new Error(`Unable to count loyalty rewards: ${rewardsError.message}`);
  if ((rewardCount ?? 0) >= currentCycle) return { processed: true, visitCreated, visitRestored, rewardCreated: false, reason: "reward_already_exists" };

  const rewardType = settings.reward_type as LoyaltyRewardType;
  if (!["fixed_discount", "percentage", "free_service"].includes(rewardType)) throw new Error("Loyalty settings contain an unsupported reward type.");
  const earnedAt = new Date();
  const expiryDays = settings.reward_expiry_days == null ? null : finiteInteger(settings.reward_expiry_days, 1);
  const expiresAt = expiryDays === null ? null : new Date(earnedAt.getTime() + expiryDays * 86_400_000).toISOString();
  const { error: rewardError } = await supabase.from("loyalty_rewards").insert({ customer_id: customer.id, reward_type: rewardType, reward_value: rewardType === "free_service" ? null : Number(settings.reward_value ?? 0), status: "available", earned_at: earnedAt.toISOString(), expires_at: expiresAt });
  if (rewardError) throw new Error(`Unable to create loyalty reward: ${rewardError.message}`);

  return { processed: true, visitCreated, visitRestored, rewardCreated: true, reason: null };
}

export async function processCompletedAppointmentForLoyalty(appointmentId: string) {
  return processAppointmentStatusForLoyalty(appointmentId);
}
