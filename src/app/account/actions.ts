"use server";

import { revalidatePath } from "next/cache";
import { ensureCustomerRecord, requireCustomerUser } from "@/lib/auth/customer";

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unexpected server error.";
}

export async function updateCustomerAccount(formData: FormData) {
  try {
    const fullName = (formData.get("fullName") ?? "").toString().trim();
    const phone = (formData.get("phone") ?? "").toString().trim();

    if (!fullName) {
      return { error: "Full name is required." };
    }

    const { supabase, user } = await requireCustomerUser();
    await ensureCustomerRecord(fullName, phone);

    const { error } = await supabase
      .from("customers")
      .update({
        full_name: fullName,
        phone,
      })
      .eq("profile_id", user.id);

    if (error) {
      return { error: error.message };
    }

    revalidatePath("/account");
    return { error: null };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

export async function subscribeToMarketingEmails() {
  try {
    const { supabase, user } = await requireCustomerUser();
    const consentedAt = new Date().toISOString();
    const { data, error } = await supabase
      .from("customers")
      .update({
        marketing_email_consent: true,
        marketing_email_consented_at: consentedAt,
        marketing_email_consent_source: "account_preferences",
        marketing_email_unsubscribed_at: null,
      })
      .eq("profile_id", user.id)
      .select("marketing_email_consent, marketing_email_consented_at, marketing_email_consent_source, marketing_email_unsubscribed_at")
      .single();

    if (error || !data) return { error: "Unable to update email preferences right now.", preference: null };
    revalidatePath("/account");
    return { error: null, preference: data };
  } catch (error) {
    return { error: toErrorMessage(error), preference: null };
  }
}

export async function unsubscribeFromMarketingEmails() {
  try {
    const { supabase, user } = await requireCustomerUser();
    const unsubscribedAt = new Date().toISOString();
    const { data, error } = await supabase
      .from("customers")
      .update({
        marketing_email_consent: false,
        marketing_email_unsubscribed_at: unsubscribedAt,
      })
      .eq("profile_id", user.id)
      .select("marketing_email_consent, marketing_email_consented_at, marketing_email_consent_source, marketing_email_unsubscribed_at")
      .single();

    if (error || !data) return { error: "Unable to update email preferences right now.", preference: null };
    revalidatePath("/account");
    return { error: null, preference: data };
  } catch (error) {
    return { error: toErrorMessage(error), preference: null };
  }
}
