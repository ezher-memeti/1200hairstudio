"use server";

import { revalidatePath } from "next/cache";
import { requireAdminUser } from "@/lib/auth/customer";
import { getUtcIsoForZurichDateTime } from "@/lib/appointments/availability";
import type { PromotionInput } from "@/lib/promotions/types";

type Result = { success: boolean; message: string };

function validate(input: PromotionInput) {
  const name = input.name.trim().slice(0, 120);
  const discountValue = Number(input.discountValue);
  const maxUsesPerCustomer = Math.floor(Number(input.maxUsesPerCustomer));
  if (!name) throw new Error("Promotion name is required.");
  if (!Number.isFinite(discountValue) || discountValue <= 0) throw new Error("Discount value must be greater than zero.");
  if (input.discountType === "percentage" && discountValue > 100) throw new Error("Percentage discount cannot exceed 100%.");
  if (input.appliesTo === "specific_service" && !input.serviceId) throw new Error("Select the service for this promotion.");
  if (input.audienceType !== "all_customers" && (!Number.isInteger(maxUsesPerCustomer) || maxUsesPerCustomer < 1)) throw new Error("Max uses per customer must be at least 1.");
  const toZurichInstant = (value: string) => {
    const [dateKey, time] = value.split("T");
    return dateKey && time ? new Date(getUtcIsoForZurichDateTime(dateKey, time)) : new Date(Number.NaN);
  };
  const startsAt = input.startsAt ? toZurichInstant(input.startsAt) : null;
  const expiresAt = input.expiresAt ? toZurichInstant(input.expiresAt) : null;
  if (startsAt && Number.isNaN(startsAt.getTime())) throw new Error("Start date is invalid.");
  if (expiresAt && Number.isNaN(expiresAt.getTime())) throw new Error("Expiry date is invalid.");
  if (startsAt && expiresAt && expiresAt <= startsAt) throw new Error("Expiry must be after the start date.");
  const customerIds = Array.from(new Set(input.customerIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id))));
  if (input.audienceType === "selected_customers" && !customerIds.length) throw new Error("Select at least one customer.");
  return {
    payload: {
      name,
      discount_type: input.discountType,
      discount_value: discountValue,
      service_id: input.appliesTo === "specific_service" ? input.serviceId : null,
      audience_type: input.audienceType,
      starts_at: startsAt?.toISOString() ?? null,
      expires_at: expiresAt?.toISOString() ?? null,
      max_uses_per_customer: maxUsesPerCustomer,
      is_active: input.isActive,
    },
    customerIds: input.audienceType === "selected_customers" ? customerIds : [],
  };
}

async function syncCustomers(supabase: Awaited<ReturnType<typeof requireAdminUser>>["supabase"], promotionId: string, customerIds: string[]) {
  const { data: existing, error } = await supabase.from("promotion_customers").select("customer_id").eq("promotion_id", promotionId);
  if (error) throw error;
  const existingIds = new Set((existing ?? []).map((row) => row.customer_id));
  const desiredIds = new Set(customerIds);
  const removeIds = [...existingIds].filter((id) => !desiredIds.has(id));
  const addIds = [...desiredIds].filter((id) => !existingIds.has(id));
  if (removeIds.length) {
    const { error: removeError } = await supabase.from("promotion_customers").delete().eq("promotion_id", promotionId).in("customer_id", removeIds);
    if (removeError) throw removeError;
  }
  if (addIds.length) {
    const { error: addError } = await supabase.from("promotion_customers").insert(addIds.map((customerId) => ({ promotion_id: promotionId, customer_id: customerId })));
    if (addError) throw addError;
  }
}

export async function savePromotion(input: PromotionInput, promotionId?: string): Promise<Result> {
  try {
    const { supabase } = await requireAdminUser();
    const { payload, customerIds } = validate(input);
    if (promotionId) {
      const { data, error } = await supabase.from("promotions").update(payload).eq("id", promotionId).select("id").maybeSingle();
      if (error) throw error;
      if (!data) return { success: false, message: "Promotion was not found or could not be updated." };
      await syncCustomers(supabase, data.id, customerIds);
    } else {
      const { data, error } = await supabase.from("promotions").insert(payload).select("id").single();
      if (error || !data) throw error ?? new Error("Promotion could not be created.");
      try {
        await syncCustomers(supabase, data.id, customerIds);
      } catch (syncError) {
        await supabase.from("promotions").delete().eq("id", data.id);
        throw syncError;
      }
    }
    revalidatePath("/admin/marketing");
    return { success: true, message: promotionId ? "Promotion updated." : "Promotion created." };
  } catch (error) {
    console.error("Promotion save failed", { operation: promotionId ? "update" : "create", promotionId, error });
    return { success: false, message: error instanceof Error && !/row-level|permission|postgres/i.test(error.message) ? error.message : "Unable to save this promotion." };
  }
}

export async function deletePromotion(promotionId: string): Promise<Result> {
  try {
    const { supabase } = await requireAdminUser();
    const { data, error } = await supabase.from("promotions").delete().eq("id", promotionId).select("id").maybeSingle();
    if (error) throw error;
    if (!data) return { success: false, message: "Promotion was not found or could not be deleted." };
    revalidatePath("/admin/marketing");
    return { success: true, message: "Promotion deleted." };
  } catch (error) {
    console.error("Promotion delete failed", { promotionId, error });
    return { success: false, message: "Unable to delete this promotion." };
  }
}
