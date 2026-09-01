import "server-only";

import type { CustomerRecord } from "@/lib/customers/types";
import { createClient } from "@/lib/supabase/server";

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

type ResolveCustomerInput = {
  email: string;
  fullName: string;
  phone: string;
  profileId?: string | null;
  isRegistered: boolean;
};

export async function recordMarketingEmailConsent(
  supabase: ServerSupabaseClient,
  customerId: string,
  source: string,
) {
  const { data, error } = await supabase
    .from("customers")
    .update({
      marketing_email_consent: true,
      marketing_email_consented_at: new Date().toISOString(),
      marketing_email_consent_source: source,
      marketing_email_unsubscribed_at: null,
    })
    .eq("id", customerId)
    .select("*")
    .single();

  if (error || !data) {
    console.error("MARKETING CONSENT UPDATE ERROR", {
      code: error?.code,
      message: error?.message,
      customerId,
    });
    throw new Error("Unable to save email preferences right now.");
  }

  return data as CustomerRecord;
}

export function normalizeCustomerEmail(email: string) {
  return email.trim().toLowerCase();
}

async function updateExistingCustomer(
  supabase: ServerSupabaseClient,
  customer: CustomerRecord,
  input: ResolveCustomerInput,
) {
  const fullName = input.fullName.trim();
  const phone = input.phone.trim();
  const updates: Partial<
    Pick<CustomerRecord, "profile_id" | "full_name" | "phone" | "is_registered">
  > = {};

  if (input.profileId && customer.profile_id !== input.profileId) {
    updates.profile_id = input.profileId;
  }

  if (input.isRegistered && !customer.is_registered) {
    updates.is_registered = true;
  }

  if (
    fullName &&
    fullName !== customer.full_name &&
    (!customer.full_name || !customer.is_registered || input.isRegistered)
  ) {
    updates.full_name = fullName;
  }

  if (
    phone &&
    phone !== customer.phone &&
    (!customer.phone || !customer.is_registered || input.isRegistered)
  ) {
    updates.phone = phone;
  }

  if (Object.keys(updates).length === 0) {
    return customer;
  }

  const { data, error } = await supabase
    .from("customers")
    .update(updates)
    .eq("id", customer.id)
    .select("*")
    .single();

  if (error || !data) {
    console.error("CUSTOMER UPDATE ERROR", {
      code: error?.code,
      message: error?.message,
      customerId: customer.id,
    });
    throw new Error("Unable to update customer details right now.");
  }

  return data as CustomerRecord;
}

export async function resolveCustomerByEmail(
  supabase: ServerSupabaseClient,
  input: ResolveCustomerInput,
) {
  const email = normalizeCustomerEmail(input.email);

  if (!email) {
    throw new Error("Customer email is required.");
  }

  const normalizedInput = { ...input, email };
  const { data: existingCustomer, error: lookupError } = await supabase
    .from("customers")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  if (lookupError) {
    console.error("CUSTOMER LOOKUP ERROR", {
      code: lookupError.code,
      message: lookupError.message,
    });
    throw new Error("Unable to prepare customer details right now.");
  }

  if (existingCustomer) {
    return updateExistingCustomer(
      supabase,
      existingCustomer as CustomerRecord,
      normalizedInput,
    );
  }

  const { data: insertedCustomer, error: insertError } = await supabase
    .from("customers")
    .insert({
      profile_id: input.profileId ?? null,
      full_name: input.fullName.trim(),
      email,
      phone: input.phone.trim(),
      is_registered: input.isRegistered,
    })
    .select("*")
    .single();

  if (!insertError && insertedCustomer) {
    return insertedCustomer as CustomerRecord;
  }

  if (insertError?.code === "23505") {
    const { data: concurrentCustomer, error: recoveryError } = await supabase
      .from("customers")
      .select("*")
      .eq("email", email)
      .maybeSingle();

    if (!recoveryError && concurrentCustomer) {
      return updateExistingCustomer(
        supabase,
        concurrentCustomer as CustomerRecord,
        normalizedInput,
      );
    }
  }

  console.error("CUSTOMER INSERT ERROR", {
    code: insertError?.code,
    message: insertError?.message,
  });
  throw new Error("Unable to prepare customer details right now.");
}
