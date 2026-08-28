import { revalidatePath } from "next/cache";

import {
  ensureCustomerRecord,
  getCurrentUserRole,
} from "@/lib/auth/customer";

import {
  addMinutesToTime,
  getUtcIsoForZurichDateTime,
} from "@/lib/appointments/availability";

import { sendBookingConfirmationEmail } from "@/lib/email/gmail";
import { resolveCustomerByEmail } from "@/lib/customers/mutations";
import type { CustomerRecord } from "@/lib/customers/types";
import { getAvailableSlots } from "@/lib/public/available-slots";
import { createClient } from "@/lib/supabase/server";

function toFullName(firstName: string, lastName: string) {
  return [firstName.trim(), lastName.trim()]
    .filter(Boolean)
    .join(" ")
    .trim();
}

export type AppointmentRequestInput = {
  serviceId: string;
  dateKey: string;
  startTime: string;
  excludeAppointmentId?: string;
  note?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
};

export async function validateAppointmentRequest(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: AppointmentRequestInput,
) {
  const { data: service, error: serviceError } = await supabase
    .from("services")
    .select("id, name, price, duration_min, duration_max, is_active")
    .eq("id", input.serviceId)
    .maybeSingle();

  if (serviceError || !service || !service.is_active) {
    return {
      error: "This service is not available right now.",
    } as const;
  }

  const selectedStartAt = getUtcIsoForZurichDateTime(
    input.dateKey,
    input.startTime,
  );

  const bookingDuration =
    service.duration_max ?? service.duration_min;

  const selectedEndAt = getUtcIsoForZurichDateTime(
    input.dateKey,
    addMinutesToTime(
      input.startTime,
      bookingDuration,
    ),
  );

  const availableSlots = await getAvailableSlots(
    service.id,
    input.dateKey,
    input.excludeAppointmentId
      ? { excludeAppointmentId: input.excludeAppointmentId }
      : undefined,
  );

  const selectedStartMs = new Date(
    selectedStartAt,
  ).getTime();

  console.log("APPOINTMENT VALIDATION", {
    serviceId: input.serviceId,
    dateKey: input.dateKey,
    startTime: input.startTime,
    selectedStartAt,
    selectedStartMs,
    availableSlots: availableSlots.map((slot) => ({
      slot_start: slot.slot_start,
      slot_start_ms: new Date(
        slot.slot_start,
      ).getTime(),
      slot_end: slot.slot_end,
    })),
  });

  const selectedSlot = availableSlots.find(
    (slot) =>
      new Date(slot.slot_start).getTime() ===
      selectedStartMs,
  );

  if (!selectedSlot) {
    console.log("APPOINTMENT SLOT REJECTED", {
      selectedStartAt,
      selectedStartMs,
      rpcStarts: availableSlots.map(
        (slot) => slot.slot_start,
      ),
    });

    return {
      error:
        "This time is no longer available. Please choose another slot.",
    } as const;
  }

  return {
    error: null,
    service,
    startAt: selectedStartAt,
    endAt: selectedSlot.slot_end || selectedEndAt,
  } as const;
}

function getAppointmentInsertErrorMessage(
  error: {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  },
) {
  console.error("APPOINTMENT INSERT ERROR", {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  });

  // PostgreSQL exclusion / unique constraint conflict.
  // Use this only for actual booking conflicts.
  if (
    error.code === "23P01" ||
    error.code === "23505"
  ) {
    return "This time is no longer available. Please choose another slot.";
  }

  return "Unable to create the appointment right now. Please try again.";
}

export async function sendConfirmationEmailSafely(details: {
  to: string;
  customerName: string;
  serviceName: string;
  startAt: string;
  endAt: string;
  price: number;
}) {
  try {
    await sendBookingConfirmationEmail(details);
  } catch (error) {
    console.error("BOOKING CONFIRMATION EMAIL ERROR", {
      message: error instanceof Error ? error.message : "Unknown error",
      details,
    });
  }
}

export async function createAppointment(
  input: AppointmentRequestInput,
) {
  const supabase = await createClient();

  const { user, role } = await getCurrentUserRole();

  const validation = await validateAppointmentRequest(
    supabase,
    input,
  );

  if (validation.error) {
    return {
      error: validation.error,
    };
  }

  const service = validation.service;
  const startAt = validation.startAt;
  const endAt = validation.endAt;

  if (!service) {
    return {
      error: "This service is not available right now.",
    };
  }

  const fullName = toFullName(
    input.firstName ?? "",
    input.lastName ?? "",
  );

  const phone = input.phone?.trim() ?? "";
  const email =
    input.email?.trim().toLowerCase() ?? "";
  const notes = input.note?.trim() || null;

  if (role === "customer" && user) {
    const customer = await ensureCustomerRecord(
      fullName,
      phone,
    );

    const { error: insertError } = await supabase
      .from("appointments")
      .insert({
        customer_id: customer.id,
        service_id: service.id,
        start_at: startAt,
        end_at: endAt,
        status: "confirmed",
        notes,
        guest_name: null,
        guest_email: null,
        guest_phone: null,
      });

    if (insertError) {
      return {
        error:
          getAppointmentInsertErrorMessage(
            insertError,
          ),
      };
    }

    if (fullName || phone) {
      const { error: customerUpdateError } =
        await supabase
          .from("customers")
          .update({
            full_name:
              fullName || customer.full_name,
            phone: phone || customer.phone,
          })
          .eq("id", customer.id);

      if (customerUpdateError) {
        console.error(
          "CUSTOMER PROFILE UPDATE ERROR",
          {
            code: customerUpdateError.code,
            message: customerUpdateError.message,
            details: customerUpdateError.details,
            hint: customerUpdateError.hint,
          },
        );
      }
    }

    const recipientEmail = customer.email || user.email || "";

    if (recipientEmail) {
      await sendConfirmationEmailSafely({
        to: recipientEmail,
        customerName: fullName || customer.full_name || "Customer",
        serviceName: service.name,
        startAt,
        endAt,
        price: service.price,
      });
    }
  } else {
    if (!fullName) {
      return {
        error:
          "Full name is required for guest bookings.",
      };
    }

    if (!email) {
      return {
        error:
          "Email is required for guest bookings.",
      };
    }

    if (!phone) {
      return {
        error:
          "Phone is required for guest bookings.",
      };
    }

    let guestCustomer: CustomerRecord;
    try {
      guestCustomer = await resolveCustomerByEmail(supabase, {
        profileId: null,
        fullName,
        email,
        phone,
        isRegistered: false,
      });
    } catch (error) {
      console.error("GUEST CUSTOMER RESOLUTION ERROR", error);
      return {
        error: "Unable to prepare your booking right now. Please try again.",
      };
    }

    const { error: insertError } = await supabase
      .from("appointments")
      .insert({
        customer_id: guestCustomer.id,
        service_id: service.id,
        start_at: startAt,
        end_at: endAt,
        status: "confirmed",
        notes,
        guest_name: fullName,
        guest_email: email,
        guest_phone: phone,
      });

    if (insertError) {
      return {
        error:
          getAppointmentInsertErrorMessage(
            insertError,
          ),
      };
    }

    await sendConfirmationEmailSafely({
      to: email,
      customerName: fullName,
      serviceName: service.name,
      startAt,
      endAt,
      price: service.price,
    });
  }

  revalidatePath("/");
  revalidatePath("/account");
  revalidatePath("/admin/appointments");
  revalidatePath("/admin/calendar");
  revalidatePath("/admin/customers");

  return {
    error: null,
  };
}
