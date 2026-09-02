export type PromotionDiscountType = "percentage" | "fixed";
export type PromotionAppliesTo = "all_services" | "specific_service";
export type PromotionAudienceType = "selected_customers" | "all_customers" | "registered_customers";

export type PromotionRecord = {
  id: string;
  name: string;
  discount_type: PromotionDiscountType;
  discount_value: number;
  service_id: string | null;
  audience_type: PromotionAudienceType;
  starts_at: string | null;
  expires_at: string | null;
  max_uses_per_customer: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type PromotionInput = {
  name: string;
  discountType: PromotionDiscountType;
  discountValue: number;
  appliesTo: PromotionAppliesTo;
  serviceId: string | null;
  audienceType: PromotionAudienceType;
  startsAt: string;
  expiresAt: string;
  maxUsesPerCustomer: number;
  isActive: boolean;
  customerIds: string[];
};

export type AdminPromotion = PromotionRecord & {
  service_name: string | null;
  customer_ids: string[];
};

export type PromotionPrice = {
  originalPrice: number;
  discountAmount: number;
  finalPrice: number;
};

export type EffectiveServicePrice = PromotionPrice & {
  discountType: PromotionDiscountType | null;
  discountValue: number | null;
  promotionId: string | null;
  promotionName: string | null;
};
