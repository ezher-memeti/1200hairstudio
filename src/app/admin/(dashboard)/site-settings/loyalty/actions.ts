"use server";

import { revalidatePath } from "next/cache";
import {
  LOYALTY_REWARD_TYPES,
  persistLoyaltySettings,
  type LoyaltySettings,
} from "@/lib/loyalty/settings";

type SettingsActionResult = { success: boolean; message: string };

export async function saveLoyaltySettings(input: LoyaltySettings): Promise<SettingsActionResult> {
  try {
    const visitsRequired = Number(input.visitsRequired);
    const rewardValue = input.rewardType === "free_service" ? null : Number(input.rewardValue);
    const rewardExpiryDays = input.rewardExpiryDays === null ? null : Number(input.rewardExpiryDays);

    if (!Number.isInteger(visitsRequired) || visitsRequired < 1) return { success: false, message: "Visits required must be a whole number of at least 1." };
    if (!LOYALTY_REWARD_TYPES.includes(input.rewardType)) return { success: false, message: "Select a supported reward type." };
    if (input.rewardType === "fixed_discount" && (!Number.isFinite(rewardValue) || rewardValue === null || rewardValue < 0)) return { success: false, message: "Fixed discount must be CHF 0 or more." };
    if (input.rewardType === "percentage" && (!Number.isFinite(rewardValue) || rewardValue === null || rewardValue < 0 || rewardValue > 100)) return { success: false, message: "Percentage reward must be between 0 and 100." };
    if (rewardExpiryDays !== null && (!Number.isInteger(rewardExpiryDays) || rewardExpiryDays < 1)) return { success: false, message: "Reward expiry must be at least 1 day." };

    await persistLoyaltySettings({
      isEnabled: input.isEnabled === true,
      visitsRequired,
      rewardType: input.rewardType,
      rewardValue,
      rewardExpiryDays,
      rewardVisitCountsTowardNext: input.rewardVisitCountsTowardNext === true,
    });
    revalidatePath("/admin/site-settings/loyalty");
    return { success: true, message: "Loyalty settings saved." };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Unexpected server error." };
  }
}
