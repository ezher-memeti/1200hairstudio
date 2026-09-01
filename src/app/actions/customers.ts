"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unexpected server error.";
}

async function requireAdminClient() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Unauthorized");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile || profile.role !== "admin") {
    throw new Error("Unauthorized");
  }

  return supabase;
}

export async function updateAdminCustomer(input: {
  customerId: string;
  fullName: string;
  email: string;
  phone: string;
  notes: string;
}) {
  try {
    const supabase = await requireAdminClient();
    const customerId = input.customerId.trim();

    if (!customerId) {
      return { error: "Customer not found." };
    }

    const fullName = input.fullName.trim();
    const email = input.email.trim().toLowerCase();
    const phone = input.phone.trim();
    const notes = input.notes.trim() || null;

    if (!fullName) {
      return { error: "Full name is required." };
    }

    if (!email) {
      return { error: "Email is required." };
    }

    const { error } = await supabase
      .from("customers")
      .update({
        full_name: fullName,
        email,
        phone,
        notes,
      })
      .eq("id", customerId);

    if (error) {
      console.error("ADMIN CUSTOMER UPDATE ERROR", error);
      return {
        error:
          error.code === "23505"
            ? "Another customer already uses this email address."
            : "Unable to update the customer right now.",
      };
    }

    revalidatePath("/admin/customers");
    revalidatePath("/admin/appointments");
    revalidatePath("/account");
    return { error: null };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

export async function updateAdminCustomerNotes(input: {
  customerId: string;
  notes: string;
}) {
  try {
    const supabase = await requireAdminClient();
    const customerId = input.customerId.trim();

    if (!customerId) {
      return { error: "Customer not found." };
    }

    const { error } = await supabase
      .from("customers")
      .update({ notes: input.notes.trim() || null })
      .eq("id", customerId);

    if (error) {
      console.error("ADMIN CUSTOMER NOTES UPDATE ERROR", error);
      return { error: "Unable to save customer notes right now." };
    }

    revalidatePath("/admin/customers");
    return { error: null };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}
