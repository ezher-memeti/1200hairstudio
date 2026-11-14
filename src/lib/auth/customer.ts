import { redirect } from "next/navigation";
import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import type { CustomerRecord } from "@/lib/customers/types";
import {
  normalizeCustomerEmail,
} from "@/lib/customers/mutations";
import { isStaleRefreshTokenError } from "@/lib/supabase/auth-errors";
import { shouldRecordSignupMarketingConsent } from "@/lib/customers/marketing-consent";
import { createClient } from "@/lib/supabase/server";

export type UserRole = "admin" | "customer" | null;

export async function getCurrentUserRole() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error && isStaleRefreshTokenError(error)) {
    return {
      user: null as User | null,
      role: null as UserRole,
    };
  }

  if (!user) {
    return {
      user: null as User | null,
      role: null as UserRole,
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  return {
    user,
    role: (profile?.role as UserRole) ?? null,
  };
}

export async function requireCustomerUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (!user || (error && isStaleRefreshTokenError(error))) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role === "admin") {
    redirect("/admin");
  }

  if (profile?.role !== "customer") {
    redirect("/login");
  }

  return {
    supabase,
    user,
  };
}

// React scopes this memoization to one server render; never share auth across requests.
export const requireAdminUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (!user || (error && isStaleRefreshTokenError(error))) {
    redirect("/admin/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role === "customer") {
    redirect("/account");
  }

  if (profile?.role !== "admin") {
    redirect("/admin/login");
  }

  return {
    supabase,
    user,
  };
});

export async function ensureCustomerRecord(
  fullName?: string | null,
  phone?: string | null,
) {
  const { supabase, user } = await requireCustomerUser();
  const requestedSignupMarketingConsent = user.user_metadata.marketing_email_consent === true;

  const fallbackFullName =
    fullName?.trim() ||
    (typeof user.user_metadata.full_name === "string"
      ? user.user_metadata.full_name
      : "") ||
    "Customer";
  const fallbackPhone =
    phone?.trim() ||
    (typeof user.user_metadata.phone === "string"
      ? user.user_metadata.phone
      : "") ||
    "";

  if (!normalizeCustomerEmail(user.email ?? "")) {
    throw new Error("Unable to create customer account.");
  }

  const { data, error } = await supabase.rpc("ensure_my_customer", {
    p_full_name: fallbackFullName,
    p_phone: fallbackPhone || null,
  });
  const customer = Array.isArray(data) ? data[0] : data;
  if (error || !customer) throw new Error("Unable to prepare customer account.");

  if (shouldRecordSignupMarketingConsent(customer as CustomerRecord, requestedSignupMarketingConsent)) {
    const consent = await supabase.rpc("set_my_marketing_email_preference", {
      p_subscribed: true,
      p_source: "signup_form",
    });
    if (consent.error) throw new Error("Unable to save email preferences right now.");
    const refreshed = await supabase.rpc("get_my_customer");
    const refreshedCustomer = Array.isArray(refreshed.data) ? refreshed.data[0] : refreshed.data;
    if (refreshed.error || !refreshedCustomer) throw new Error("Unable to load customer account.");
    return refreshedCustomer as CustomerRecord;
  }

  return customer as CustomerRecord;
}
