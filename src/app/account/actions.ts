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
