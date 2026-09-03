import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { EffectiveServicePrice, PromotionPrice, PromotionRecord } from "@/lib/promotions/types";
import { createClient } from "@/lib/supabase/server";

function toCents(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100);
}

const promotionDebugEnabled = process.env.NODE_ENV !== "production";

function debugPromotion(message: string, details: Record<string, unknown>) {
  if (promotionDebugEnabled) console.info(`[promotion] ${message}`, details);
}

export function calculatePromotionPrice(input: { originalPrice: number; discountType: "percentage" | "fixed"; discountValue: number }): PromotionPrice {
  const originalCents = Math.max(0, toCents(input.originalPrice));
  const discountCents = input.discountType === "percentage"
    ? Math.round(originalCents * Math.min(100, Math.max(0, input.discountValue)) / 100)
    : Math.max(0, toCents(input.discountValue));
  const appliedDiscount = Math.min(originalCents, discountCents);
  return { originalPrice: originalCents / 100, discountAmount: appliedDiscount / 100, finalPrice: (originalCents - appliedDiscount) / 100 };
}

export async function getPromotionUsageCount(input: { promotionId: string; customerId: string; supabase?: SupabaseClient }) {
  const supabase = input.supabase ?? await createClient();
  const { count, error } = await supabase.from("appointments").select("id", { count: "exact", head: true }).eq("promotion_id", input.promotionId).eq("customer_id", input.customerId).neq("status", "cancelled");
  if (error) throw error;
  return count ?? 0;
}

export async function validatePromotion(input: { promotionId: string; serviceId: string; supabase?: SupabaseClient }) {
  const supabase = input.supabase ?? await createClient();
  const { data: promotion, error } = await supabase.from("promotions").select("*").eq("id", input.promotionId).maybeSingle();
  if (error || !promotion) return { valid: false as const, reason: error ? "promotion_query_error" : "promotion_not_found", message: "This promotion is not available." };
  const record = promotion as PromotionRecord;
  const now = Date.now();
  if (!record.is_active) return { valid: false as const, reason: "inactive", message: "This promotion is no longer active." };
  if (record.starts_at && new Date(record.starts_at).getTime() > now) return { valid: false as const, reason: "not_started", message: "This promotion is not active yet." };
  if (record.expires_at && new Date(record.expires_at).getTime() < now) return { valid: false as const, reason: "expired", message: "This promotion is no longer active." };
  if (record.service_id !== null && record.service_id !== input.serviceId) {
    return { valid: false as const, reason: "service_mismatch", message: "This promotion does not apply to the selected service." };
  }
  const discountValue = Number(record.discount_value);
  if (!Number.isFinite(discountValue) || discountValue <= 0 || (record.discount_type === "percentage" && discountValue > 100) || !["percentage", "fixed"].includes(record.discount_type)) {
    return { valid: false as const, reason: "invalid_discount_configuration", message: "This promotion cannot be applied." };
  }
  if (record.audience_type === "all_customers") return { valid: true as const, promotion: record };
  return { valid: false as const, reason: "restricted_audience_requires_rpc", message: "This promotion requires an eligible customer account." };
}

export async function getEffectiveServicePrice(input: { serviceId: string; customerId?: string | null; authenticatedCustomer?: boolean; supabase?: SupabaseClient }): Promise<EffectiveServicePrice | null> {
  const supabase = input.supabase ?? await createClient();
  const { data: service, error: serviceError } = await supabase.from("services").select("id,price").eq("id", input.serviceId).maybeSingle();
  if (serviceError || !service) return null;
  const originalPrice = Number(service.price);
  if (!Number.isFinite(originalPrice)) {
    console.error("Service price is not numeric", { serviceId: input.serviceId, value: service.price });
    return null;
  }
  const base: EffectiveServicePrice = { originalPrice, finalPrice: originalPrice, discountAmount: 0, discountType: null, discountValue: null, promotionId: null, promotionName: null };
  const { data: promotions, error } = input.authenticatedCustomer
    ? await supabase.rpc("get_my_available_promotions", { p_service_id: input.serviceId })
    : await supabase.from("promotions").select("*").eq("is_active", true).eq("audience_type", "all_customers").or(`service_id.is.null,service_id.eq.${input.serviceId}`);
  if (error) {
    console.error("Effective promotion lookup failed", { serviceId: input.serviceId, customerId: input.customerId, error });
    return base;
  }
  const { data: customer } = input.customerId ? await supabase.from("customers").select("id,is_registered").eq("id", input.customerId).maybeSingle() : { data: null };
  debugPromotion("resolution started", { customerId: input.customerId, customerIsRegistered: customer?.is_registered ?? null, serviceId: input.serviceId, candidatePromotions: promotions?.length ?? 0, originalPrice });
  const eligible: Array<{ promotion: PromotionRecord; price: PromotionPrice }> = [];
  for (const promotion of (promotions ?? []) as PromotionRecord[]) {
    const result = input.authenticatedCustomer ? { valid: true as const, promotion } : await validatePromotion({ promotionId: promotion.id, serviceId: input.serviceId, supabase });
    if (!result.valid) { debugPromotion("candidate rejected", { promotionId: promotion.id, promotionName: promotion.name, audienceType: promotion.audience_type, promotionServiceId: promotion.service_id, reason: result.reason }); continue; }
    const discountValue = Number(promotion.discount_value);
    if (!Number.isFinite(discountValue) || discountValue <= 0) {
      debugPromotion("candidate rejected", { promotionId: promotion.id, promotionName: promotion.name, reason: "invalid_discount_value", discountValue: result.promotion.discount_value });
      continue;
    }
    eligible.push({ promotion, price: calculatePromotionPrice({ originalPrice, discountType: promotion.discount_type, discountValue }) });
  }
  eligible.sort((first, second) => first.price.finalPrice - second.price.finalPrice || (first.promotion.expires_at ? new Date(first.promotion.expires_at).getTime() : Number.MAX_SAFE_INTEGER) - (second.promotion.expires_at ? new Date(second.promotion.expires_at).getTime() : Number.MAX_SAFE_INTEGER) || first.promotion.id.localeCompare(second.promotion.id));
  const best = eligible[0];
  debugPromotion("resolution completed", { customerId: input.customerId, serviceId: input.serviceId, winningPromotionId: best?.promotion.id ?? null, winningPromotionName: best?.promotion.name ?? null, originalPrice, finalPrice: best?.price.finalPrice ?? originalPrice });
  return best ? { ...best.price, discountType: best.promotion.discount_type, discountValue: best.promotion.discount_value, promotionId: best.promotion.id, promotionName: best.promotion.name } : base;
}
