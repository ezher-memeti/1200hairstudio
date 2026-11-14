export const DISCOUNT_SOURCES = ["promotion", "manual", "loyalty"] as const;
export type DiscountSource = (typeof DISCOUNT_SOURCES)[number];

export const DISCOUNT_TYPES = ["percentage", "fixed", "free_service"] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

export const LOYALTY_REWARD_TYPES = ["fixed_discount", "percentage", "free_service"] as const;
export type LoyaltyRewardType = (typeof LOYALTY_REWARD_TYPES)[number];

export function discountTypeForReward(rewardType: LoyaltyRewardType): DiscountType {
  return rewardType === "fixed_discount" ? "fixed" : rewardType;
}
