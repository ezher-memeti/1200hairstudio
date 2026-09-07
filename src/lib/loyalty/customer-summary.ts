import "server-only";

import { requireCustomerUser } from "@/lib/auth/customer";
import type { LoyaltyRewardType } from "@/lib/loyalty/settings";

export type CustomerLoyaltyVisit = {
  id: string;
  appointmentId: string;
  appointmentStartAt: string | null;
  serviceName: string | null;
  isEligible: boolean;
  rewardCycle: number;
  createdAt: string;
};

export type CustomerLoyaltyReward = {
  id: string;
  rewardType: LoyaltyRewardType;
  rewardValue: number | null;
  status: "available" | "reserved" | "redeemed" | "expired" | "cancelled" | string;
  earnedAt: string;
  expiresAt: string | null;
  redeemedAt: string | null;
  redeemedAppointmentId: string | null;
};

export type CustomerLoyaltySummary = {
  isEnabled: boolean;
  visitsRequired: number;
  configuredRewardType: LoyaltyRewardType;
  configuredRewardValue: number | null;
  rewardExpiryDays: number | null;
  rewardVisitCountsTowardNext: boolean;
  eligibleVisitsInCurrentCycle: number;
  visitsRemaining: number;
  progressPercent: number;
  availableRewards: number;
  earnedRewards: number;
  redeemedRewards: number;
  visits: CustomerLoyaltyVisit[];
  rewards: CustomerLoyaltyReward[];
};

const finiteNumber = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function calculateCustomerLoyaltySummary(input: {
  isEnabled: boolean;
  visitsRequired: number;
  configuredRewardType: LoyaltyRewardType;
  configuredRewardValue: number | null;
  rewardExpiryDays: number | null;
  rewardVisitCountsTowardNext: boolean;
  visits: CustomerLoyaltyVisit[];
  rewards: CustomerLoyaltyReward[];
}): CustomerLoyaltySummary {
  const visitsRequired = Math.max(1, Math.floor(input.visitsRequired));
  const currentCycle = Math.max(1, ...input.visits.map((visit) => visit.rewardCycle));
  const eligibleVisits = input.visits.filter((visit) => visit.rewardCycle === currentCycle && visit.isEligible).length;
  const completed = Math.min(eligibleVisits, visitsRequired);

  return {
    ...input,
    visitsRequired,
    eligibleVisitsInCurrentCycle: completed,
    visitsRemaining: Math.max(0, visitsRequired - completed),
    progressPercent: Math.min(100, (completed / visitsRequired) * 100),
    availableRewards: input.rewards.filter((reward) => reward.status === "available").length,
    earnedRewards: input.rewards.length,
    redeemedRewards: input.rewards.filter((reward) => reward.status === "redeemed").length,
    visits: input.visits.slice().sort((first, second) => new Date(second.appointmentStartAt ?? second.createdAt).getTime() - new Date(first.appointmentStartAt ?? first.createdAt).getTime()),
    rewards: input.rewards.slice().sort((first, second) => new Date(second.earnedAt).getTime() - new Date(first.earnedAt).getTime()),
  };
}

export async function getMyLoyaltySummary(customerId: string): Promise<CustomerLoyaltySummary> {
  const { supabase, user } = await requireCustomerUser();
  const { data: customer } = await supabase.from("customers").select("id").eq("id", customerId).eq("profile_id", user.id).maybeSingle();
  if (!customer) throw new Error("Customer account not found.");

  const [{ data: settings, error: settingsError }, { data: visitRows, error: visitsError }, { data: rewardRows, error: rewardsError }] = await Promise.all([
    supabase.from("loyalty_settings").select("is_enabled,visits_required,reward_type,reward_value,reward_expiry_days,reward_visit_counts_toward_next").limit(1).maybeSingle(),
    supabase.from("loyalty_visits").select("id,appointment_id,is_eligible,reward_cycle,created_at").eq("customer_id", customerId),
    supabase.from("loyalty_rewards").select("id,reward_type,reward_value,status,earned_at,expires_at,redeemed_at,redeemed_appointment_id").eq("customer_id", customerId),
  ]);
  if (settingsError || visitsError || rewardsError) throw new Error("Unable to load loyalty details.");

  const appointmentIds = Array.from(new Set((visitRows ?? []).map((row) => row.appointment_id).filter(Boolean)));
  const { data: appointmentRows, error: appointmentsError } = appointmentIds.length
    ? await supabase.from("appointments").select("id,start_at,service_id").in("id", appointmentIds).eq("customer_id", customerId)
    : { data: [], error: null };
  if (appointmentsError) throw new Error("Unable to load loyalty visit details.");

  const serviceIds = Array.from(new Set((appointmentRows ?? []).map((row) => row.service_id).filter(Boolean)));
  const { data: serviceRows, error: servicesError } = serviceIds.length
    ? await supabase.from("services").select("id,name").in("id", serviceIds)
    : { data: [], error: null };
  if (servicesError) throw new Error("Unable to load loyalty service details.");

  const servicesById = new Map((serviceRows ?? []).map((service) => [service.id, service.name]));
  const appointmentsById = new Map((appointmentRows ?? []).map((appointment) => [appointment.id, appointment]));
  const rewardType = ["fixed_discount", "percentage", "free_service"].includes(settings?.reward_type ?? "") ? settings?.reward_type as LoyaltyRewardType : "fixed_discount";

  return calculateCustomerLoyaltySummary({
    isEnabled: settings?.is_enabled ?? false,
    visitsRequired: finiteNumber(settings?.visits_required, 10),
    configuredRewardType: rewardType,
    configuredRewardValue: settings?.reward_value == null ? null : finiteNumber(settings.reward_value),
    rewardExpiryDays: settings?.reward_expiry_days == null ? null : finiteNumber(settings.reward_expiry_days),
    rewardVisitCountsTowardNext: settings?.reward_visit_counts_toward_next ?? false,
    visits: (visitRows ?? []).map((row) => {
      const appointment = appointmentsById.get(row.appointment_id);
      return { id: row.id, appointmentId: row.appointment_id, appointmentStartAt: appointment?.start_at ?? null, serviceName: appointment ? servicesById.get(appointment.service_id) ?? null : null, isEligible: row.is_eligible, rewardCycle: finiteNumber(row.reward_cycle, 1), createdAt: row.created_at };
    }),
    rewards: (rewardRows ?? []).map((row) => ({ id: row.id, rewardType: row.reward_type as LoyaltyRewardType, rewardValue: row.reward_value === null ? null : finiteNumber(row.reward_value), status: row.status === "available" && row.expires_at && new Date(row.expires_at).getTime() <= Date.now() ? "expired" : row.status, earnedAt: row.earned_at, expiresAt: row.expires_at, redeemedAt: row.redeemed_at, redeemedAppointmentId: row.redeemed_appointment_id })),
  });
}
