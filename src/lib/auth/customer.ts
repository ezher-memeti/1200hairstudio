import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import type { CustomerRecord } from "@/lib/customers/types";
import {
  normalizeCustomerEmail,
  resolveCustomerByEmail,
} from "@/lib/customers/mutations";
import { isStaleRefreshTokenError } from "@/lib/supabase/auth-errors";
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

export async function requireAdminUser() {
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
}

export async function ensureCustomerRecord(
  fullName?: string | null,
  phone?: string | null,
) {
  const { supabase, user } = await requireCustomerUser();
  const { data: existingCustomer, error: customerLookupError } =
    await supabase
      .from("customers")
      .select("*")
      .eq("profile_id", user.id)
      .maybeSingle();

  if (customerLookupError) {
    throw new Error("Unable to load customer account.");
  }

  if (existingCustomer) {
    const customer = existingCustomer as CustomerRecord;
    const updates: Partial<Pick<CustomerRecord, "full_name" | "phone" | "is_registered">> = {};
    const normalizedFullName = fullName?.trim();
    const normalizedPhone = phone?.trim();

    if (!customer.is_registered) {
      updates.is_registered = true;
    }
    if (normalizedFullName) {
      updates.full_name = normalizedFullName;
    }
    if (normalizedPhone) {
      updates.phone = normalizedPhone;
    }

    if (Object.keys(updates).length === 0) {
      return customer;
    }

    const { data: updatedCustomer, error: updateError } = await supabase
      .from("customers")
      .update(updates)
      .eq("id", customer.id)
      .select("*")
      .single();

    if (updateError || !updatedCustomer) {
      throw new Error("Unable to update customer account.");
    }

    return updatedCustomer as CustomerRecord;
  }

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

  const email = normalizeCustomerEmail(user.email ?? "");
  if (!email) {
    throw new Error("Unable to create customer account.");
  }

  return resolveCustomerByEmail(supabase, {
    profileId: user.id,
    fullName: fallbackFullName,
    email,
    phone: fallbackPhone,
    isRegistered: true,
  });
}
