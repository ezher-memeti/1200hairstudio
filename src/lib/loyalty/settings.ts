import "server-only";

import { requireAdminUser } from "@/lib/auth/customer";

export const LOYALTY_REWARD_TYPES = ["fixed_discount", "percentage", "free_service"] as const;

export type LoyaltyRewardType = (typeof LOYALTY_REWARD_TYPES)[number];

export type LoyaltySettings = {
  id: string | null;
  isEnabled: boolean;
  visitsRequired: number;
  rewardType: LoyaltyRewardType;
  rewardValue: number | null;
  rewardExpiryDays: number | null;
  rewardVisitCountsTowardNext: boolean;
};

export const DEFAULT_LOYALTY_SETTINGS: LoyaltySettings = {
  id: null,
  isEnabled: true,
  visitsRequired: 10,
  rewardType: "fixed_discount",
  rewardValue: 25,
  rewardExpiryDays: null,
  rewardVisitCountsTowardNext: false,
};

type LoyaltySettingsRow = {
  id: string;
  is_enabled: boolean | null;
  visits_required: number | string | null;
  reward_type: string | null;
  reward_value: number | string | null;
  reward_expiry_days: number | string | null;
  reward_visit_counts_toward_next: boolean | null;
};

function finiteNumber(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeRewardType(value: unknown): LoyaltyRewardType {
  return LOYALTY_REWARD_TYPES.includes(value as LoyaltyRewardType)
    ? (value as LoyaltyRewardType)
    : DEFAULT_LOYALTY_SETTINGS.rewardType;
}

function normalizeRow(row: LoyaltySettingsRow | null): LoyaltySettings {
  if (!row) return DEFAULT_LOYALTY_SETTINGS;

  const rewardType = normalizeRewardType(row.reward_type);
  const rawRewardValue = row.reward_value;
  const rawExpiry = row.reward_expiry_days;

  return {
    id: row.id,
    isEnabled: row.is_enabled ?? DEFAULT_LOYALTY_SETTINGS.isEnabled,
    visitsRequired: finiteNumber(row.visits_required, DEFAULT_LOYALTY_SETTINGS.visitsRequired),
    rewardType,
    rewardValue: rewardType === "free_service"
      ? (rawRewardValue === null ? null : finiteNumber(rawRewardValue, 0))
      : finiteNumber(rawRewardValue, DEFAULT_LOYALTY_SETTINGS.rewardValue ?? 0),
    rewardExpiryDays: rawExpiry === null ? null : finiteNumber(rawExpiry, 1),
    rewardVisitCountsTowardNext: row.reward_visit_counts_toward_next ?? false,
  };
}

export async function getLoyaltySettings(): Promise<LoyaltySettings> {
  const { supabase } = await requireAdminUser();
  const { data, error } = await supabase
    .from("loyalty_settings")
    .select("id, is_enabled, visits_required, reward_type, reward_value, reward_expiry_days, reward_visit_counts_toward_next")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Unable to load loyalty settings", error);
    throw new Error("Unable to load loyalty settings.");
  }

  return normalizeRow(data as LoyaltySettingsRow | null);
}

export async function persistLoyaltySettings(settings: Omit<LoyaltySettings, "id">) {
  const { supabase } = await requireAdminUser();
  const { data: existing, error: loadError } = await supabase
    .from("loyalty_settings")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (loadError) {
    console.error("Unable to identify loyalty settings row", loadError);
    throw new Error("Unable to save loyalty settings.");
  }

  const payload = {
    is_enabled: settings.isEnabled,
    visits_required: settings.visitsRequired,
    reward_type: settings.rewardType,
    reward_value: settings.rewardType === "free_service" ? null : settings.rewardValue,
    reward_expiry_days: settings.rewardExpiryDays,
    reward_visit_counts_toward_next: settings.rewardVisitCountsTowardNext,
  };

  const query = existing?.id
    ? supabase.from("loyalty_settings").update(payload).eq("id", existing.id).select("id").single()
    : supabase.from("loyalty_settings").insert(payload).select("id").single();
  const { data, error } = await query;

  if (error || !data) {
    console.error("Unable to persist loyalty settings", { operation: existing?.id ? "update" : "insert", error });
    throw new Error("Unable to save loyalty settings.");
  }

  return data.id as string;
}
