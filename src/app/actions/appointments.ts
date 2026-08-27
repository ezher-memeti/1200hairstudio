"use server";

import { revalidatePath } from "next/cache";
import {
  createAppointment,
  validateAppointmentRequest,
} from "@/lib/appointments/mutations";
import type { AppointmentStatus } from "@/lib/appointments/types";
import { sendBookingConfirmationEmail } from "@/lib/email/gmail";
import { getAvailableSlots, mapAvailableSlotsForDisplay } from "@/lib/public/available-slots";
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
    serviceId?: string;
    dateKey?: string;
    startTime?: string;
    sendNotification?: boolean | string | null | undefined;
  },
) {
  try {
    const supabase = await requireAdminClient();
    if (input.serviceId && input.dateKey && input.startTime) {
      const sendNotification =
        typeof input.sendNotification === "boolean"
          ? input.sendNotification
          : input.sendNotification === "on" ||
            input.sendNotification === "true" ||
            input.sendNotification === "1";
      const { data: currentAppointment, error: lookupError } = await supabase
        .from("appointments")
        .select("*")
        .eq("id", input.appointmentId)
        .maybeSingle();

      if (lookupError || !currentAppointment) {
        return { error: lookupError?.message ?? "Appointment not found.", emailError: null, emailStatus: "skipped" as const };
      }

      const validation = await validateAppointmentRequest(supabase, {
        serviceId: input.serviceId,
        dateKey: input.dateKey,
        startTime: input.startTime,
        excludeAppointmentId: input.appointmentId,
      });

      if (validation.error || !validation.service) {
        return {
          error: validation.error ?? "This service is not available right now.",
          emailError: null,
          emailStatus: "skipped" as const,
        };
      }

      const notes = typeof input.notes === "string" ? input.notes.trim() || null : currentAppointment.notes;
      const { error: updateError } = await supabase
        .from("appointments")
        .update({
          service_id: validation.service.id,
          start_at: validation.startAt,
          end_at: validation.endAt,
          notes,
        })
        .eq("id", input.appointmentId);

      if (updateError) {
        return { error: updateError.message, emailError: null, emailStatus: "skipped" as const };
      }

      const customerName =
        currentAppointment.customer_name ??
        currentAppointment.guest_name ??
        "Customer";
      const customerEmail =
        currentAppointment.customer_email ??
        currentAppointment.guest_email ??
        "";
      let emailError: string | null = null;
      let emailStatus: "sent" | "failed" | "skipped" = "skipped";

      if (sendNotification && customerEmail) {
        try {
          await import("@/lib/email/gmail").then(({ sendBookingUpdateEmail }) =>
            sendBookingUpdateEmail({
              to: customerEmail,
              customerName,
              serviceName: validation.service.name,
              startAt: validation.startAt,
              endAt: validation.endAt,
              price: validation.service.price,
            }),
          );
          emailStatus = "sent";
        } catch (error) {
          emailError = toErrorMessage(error);
          emailStatus = "failed";
          console.error("ADMIN APPOINTMENT UPDATE EMAIL ERROR", error);
        }
      }

      revalidatePath("/admin/appointments");
      revalidatePath("/admin/calendar");
      revalidatePath("/account");
      return { error: null, emailError, emailStatus };
    }

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

export async function removeAdminAppointment(input: {
  appointmentId: string;
  sendNotification?: boolean | string | null | undefined;
}) {
  try {
    const supabase = await requireAdminClient();
    const sendNotification =
      typeof input.sendNotification === "boolean"
        ? input.sendNotification
        : input.sendNotification === "on" ||
          input.sendNotification === "true" ||
          input.sendNotification === "1";
    const { data: appointment, error: lookupError } = await supabase
      .from("appointments")
      .select("*")
      .eq("id", input.appointmentId)
      .maybeSingle();

    if (lookupError || !appointment) {
      return { error: lookupError?.message ?? "Appointment not found.", emailError: null, emailStatus: "skipped" as const };
    }

    const { data: service } = await supabase
      .from("services")
      .select("name, price")
      .eq("id", appointment.service_id)
      .maybeSingle();

    const { error } = await supabase.from("appointments").delete().eq("id", input.appointmentId);

    if (error) {
      return { error: error.message, emailError: null, emailStatus: "skipped" as const };
    }

    const customerName =
      appointment.customer_name ??
      appointment.guest_name ??
      "Customer";
    const customerEmail =
      appointment.customer_email ??
      appointment.guest_email ??
      "";
    let emailError: string | null = null;
    let emailStatus: "sent" | "failed" | "skipped" = "skipped";

    if (sendNotification && customerEmail && service) {
      try {
        await import("@/lib/email/gmail").then(({ sendBookingCancellationEmail }) =>
          sendBookingCancellationEmail({
            to: customerEmail,
            customerName,
            serviceName: service.name,
            startAt: appointment.start_at,
            endAt: appointment.end_at,
            price: service.price,
          }),
        );
        emailStatus = "sent";
      } catch (cause) {
        emailError = toErrorMessage(cause);
        emailStatus = "failed";
        console.error("ADMIN APPOINTMENT REMOVAL EMAIL ERROR", cause);
      }
    }

    revalidatePath("/admin/appointments");
    revalidatePath("/account");
    revalidatePath("/admin/calendar");
    return { error: null, emailError, emailStatus };
  } catch (error) {
    return { error: toErrorMessage(error), emailError: null, emailStatus: "skipped" as const };
  }
}

export async function deleteAdminAppointment(appointmentId: string) {
  return removeAdminAppointment({ appointmentId, sendNotification: false });
}

export async function getAdminAvailableSlotTimes(input: {
  serviceId: string;
  dateKey: string;
  excludeAppointmentId?: string;
}) {
  try {
    await requireAdminClient();

    if (!input.serviceId || !input.dateKey) {
      return { error: "Choose a service and date first.", slots: [] };
    }

    const slots = await getAvailableSlots(
      input.serviceId,
      input.dateKey,
      input.excludeAppointmentId ? { excludeAppointmentId: input.excludeAppointmentId } : undefined,
    );
    return { error: null, slots: mapAvailableSlotsForDisplay(slots) };
  } catch (error) {
    return { error: toErrorMessage(error), slots: [] };
  }
}

export async function createAdminAppointment(input: {
  customerId: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  serviceId: string;
  dateKey: string;
  startTime: string;
  notes: string;
  sendConfirmationEmail: boolean | string | null | undefined;
}) {
  try {
    const supabase = await requireAdminClient();
    const sendConfirmation =
      typeof input.sendConfirmationEmail === "boolean"
        ? input.sendConfirmationEmail
        : input.sendConfirmationEmail === "on" ||
          input.sendConfirmationEmail === "true" ||
          input.sendConfirmationEmail === "1";
    const selectedCustomerId = input.customerId?.trim() || null;
    const { data: selectedCustomer, error: customerLookupError } = selectedCustomerId
      ? await supabase
          .from("customers")
          .select("id, full_name, email, phone")
          .eq("id", selectedCustomerId)
          .maybeSingle()
      : { data: null, error: null };

    if (customerLookupError) {
      return { error: customerLookupError.message, emailError: null, emailStatus: "skipped" as const };
    }

    const customerName = (
      selectedCustomer?.full_name ??
      input.customerName
    ).trim();
    const customerEmail = (
      selectedCustomer?.email ??
      input.customerEmail
    ).trim().toLowerCase();
    const customerPhone = (
      selectedCustomer?.phone ??
      input.customerPhone
    ).trim();
    const notes = input.notes.trim() || null;

    if (!input.serviceId || !input.dateKey || !input.startTime) {
      return { error: "Choose a service, date, and time.", emailError: null };
    }

    if (!customerName) {
      return { error: "Customer name is required.", emailError: null };
    }

    const validation = await validateAppointmentRequest(supabase, {
      serviceId: input.serviceId,
      dateKey: input.dateKey,
      startTime: input.startTime,
    });

    if (validation.error || !validation.service) {
      return { error: validation.error ?? "This service is not available right now.", emailError: null };
    }

    const { error: insertError } = await supabase
      .from("appointments")
      .insert({
        customer_id: selectedCustomerId,
        service_id: validation.service.id,
        booking_source: "admin",
        customer_name: customerName,
        customer_email: customerEmail || null,
        customer_phone: customerPhone || null,
        start_at: validation.startAt,
        end_at: validation.endAt,
        status: "confirmed",
        notes,
        guest_name: selectedCustomerId ? null : customerName,
        guest_email: selectedCustomerId ? null : customerEmail || null,
        guest_phone: selectedCustomerId ? null : customerPhone || null,
      })
      .select("id")
      .single();

    if (insertError) {
      return { error: insertError.message, emailError: null, emailStatus: "skipped" as const };
    }

    let emailError: string | null = null;
    let emailStatus: "sent" | "failed" | "skipped" = "skipped";

    if (sendConfirmation && customerEmail) {
      try {
        await sendBookingConfirmationEmail({
          to: customerEmail,
          customerName,
          serviceName: validation.service.name,
          startAt: validation.startAt,
          endAt: validation.endAt,
          price: validation.service.price,
        });
        emailStatus = "sent";
      } catch (error) {
        emailError = toErrorMessage(error);
        emailStatus = "failed";
        console.error("ADMIN APPOINTMENT EMAIL ERROR", error);
      }
    }

    revalidatePath("/admin/appointments");
    revalidatePath("/admin/calendar");
    revalidatePath("/account");

    return {
      error: null,
      emailError,
      emailStatus,
      appointmentId: true,
    };
  } catch (error) {
    return { error: toErrorMessage(error), emailError: null, emailStatus: "skipped" as const };
  }
}
