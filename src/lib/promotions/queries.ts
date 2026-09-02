import "server-only";

import { requireAdminUser } from "@/lib/auth/customer";
import type { AdminPromotion, PromotionRecord } from "@/lib/promotions/types";

export async function getAdminPromotions(): Promise<AdminPromotion[]> {
  const { supabase } = await requireAdminUser();
  const [{ data: promotions, error }, { data: assignments, error: assignmentError }, { data: services, error: servicesError }] = await Promise.all([
    supabase.from("promotions").select("*").order("created_at", { ascending: false }),
    supabase.from("promotion_customers").select("promotion_id,customer_id"),
    supabase.from("services").select("id,name"),
  ]);
  if (error) throw new Error(`Unable to load promotions: ${error.message}`);
  if (assignmentError) throw new Error(`Unable to load promotion customers: ${assignmentError.message}`);
  if (servicesError) throw new Error(`Unable to load promotion services: ${servicesError.message}`);
  const serviceNames = new Map((services ?? []).map((service) => [service.id, service.name]));
  const customerIds = new Map<string, string[]>();
  for (const row of assignments ?? []) customerIds.set(row.promotion_id, [...(customerIds.get(row.promotion_id) ?? []), row.customer_id]);
  return ((promotions ?? []) as PromotionRecord[]).map((promotion) => ({ ...promotion, service_name: promotion.service_id ? serviceNames.get(promotion.service_id) ?? null : null, customer_ids: customerIds.get(promotion.id) ?? [] }));
}

export function isPromotionCurrentlyActive(promotion: PromotionRecord, now = Date.now()) {
  return promotion.is_active && (!promotion.starts_at || new Date(promotion.starts_at).getTime() <= now) && (!promotion.expires_at || new Date(promotion.expires_at).getTime() > now);
}
