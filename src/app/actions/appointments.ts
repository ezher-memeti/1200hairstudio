"use server";

import { revalidatePath } from "next/cache";
import { createAppointment } from "@/lib/appointments/mutations";
import type { AppointmentStatus } from "@/lib/appointments/types";
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

export async function bookAppointment(formData: FormData) {
  try {
    const serviceId = (formData.get("serviceId") ?? "").toString().trim();
    const dateKey = (formData.get("dateKey") ?? "").toString().trim();
    const startTime = (formData.get("startTime") ?? "").toString().trim();
    const firstName = (formData.get("firstName") ?? "").toString().trim();
    const lastName = (formData.get("lastName") ?? "").toString().trim();
    const email = (formData.get("email") ?? "").toString().trim();
    const phone = (formData.get("phone") ?? "").toString().trim();
    const note = (formData.get("note") ?? "").toString().trim();

    if (!serviceId || !dateKey || !startTime) {
      return { error: "Choose a service, date, and time." };
    }

    const result = await createAppointment({
      serviceId,
      dateKey,
      startTime,
      note,
      firstName,
      lastName,
      email,
      phone,
    });

    return result;
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

export async function updateAdminAppointment(
  input: {
    appointmentId: string;
    status?: AppointmentStatus;
    notes?: string;
  },
) {
  try {
    const supabase = await requireAdminClient();
    const payload: { status?: AppointmentStatus; notes?: string | null } = {};

    if (input.status) {
      payload.status = input.status;
    }

    if (typeof input.notes === "string") {
      payload.notes = input.notes.trim() || null;
    }

    if (Object.keys(payload).length === 0) {
      return { error: "No changes to save." };
    }

    const { error } = await supabase
      .from("appointments")
      .update(payload)
      .eq("id", input.appointmentId);

    if (error) {
      return { error: error.message };
    }

    revalidatePath("/admin/appointments");
    revalidatePath("/account");
    return { error: null };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

export async function deleteAdminAppointment(appointmentId: string) {
  try {
    const supabase = await requireAdminClient();
    const { error } = await supabase.from("appointments").delete().eq("id", appointmentId);

    if (error) {
      return { error: error.message };
    }

    revalidatePath("/admin/appointments");
    revalidatePath("/account");
    revalidatePath("/admin/calendar");
    return { error: null };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}
