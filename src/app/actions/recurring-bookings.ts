"use server";

import { revalidatePath } from "next/cache";
import { requireAdminUser, requireCustomerUser } from "@/lib/auth/customer";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildRecurringBookingTemplate, createRecurringBookingSeries, getRecurringOpenBusinessWeekdays, previewRecurringBooking, previewRecurringBookingRemoval, removeRecurringAppointmentOccurrence, removeRecurringBookingSeries, setRecurringBookingState } from "@/lib/recurring-bookings/service";
import type { RecurringBookingInput } from "@/lib/recurring-bookings/types";
import { getAvailableSlotTimes } from "@/lib/public/available-slots";
import { addDaysToDateKey, getCurrentZurichDateTime, getWeekdayNumber, parseDateKey } from "@/lib/public/booking-availability-utils";

const message = (error: unknown) => error instanceof Error ? error.message : "Unable to process recurring booking.";
const refresh = () => { revalidatePath("/account"); revalidatePath("/"); revalidatePath("/admin/appointments"); revalidatePath("/admin/calendar"); revalidatePath("/admin/customers"); };

export async function getRecurringWorkingDays() {
  try {
    return { error: null, weekdays: await getRecurringOpenBusinessWeekdays() };
  } catch (error) {
    return { error: message(error), weekdays: [] as number[] };
  }
}

async function currentCustomerId() {
  const { supabase, user } = await requireCustomerUser();
  const { data } = await supabase.from("customers").select("id").eq("profile_id", user.id).maybeSingle();
  if (!data) throw new Error("Customer account not found.");
  return data.id as string;
}

async function assertCustomerOwnsSeries(seriesId: string) {
  const customerId = await currentCustomerId();
  const admin = createAdminClient();
  const { data } = await admin.from("recurring_bookings").select("id").eq("id", seriesId).eq("customer_id", customerId).maybeSingle();
  if (!data) throw new Error("Recurring booking not found.");
}

function nextDateForWeekday(weekday: number, requestedDate?: string) {
  const base = requestedDate || getCurrentZurichDateTime().dateKey;
  const date = parseDateKey(base);
  if (!date || weekday < 1 || weekday > 7) throw new Error("Choose a valid day.");
  return addDaysToDateKey(base, (weekday - getWeekdayNumber(date) + 7) % 7);
}

async function recurringStartSlots(serviceId: string, weekday: number, requestedDate: string | undefined, enforceCustomerPolicy: boolean) {
  if (!serviceId) throw new Error("Choose a service first.");
  const dateKey = nextDateForWeekday(weekday, requestedDate);
  const slots = await getAvailableSlotTimes(serviceId, dateKey, {
    enforceCustomerPolicy,
    bookingContext: "recurring",
  });
  return { dateKey, slots };
}

export async function getCustomerRecurringStartSlots(serviceId: string, weekday: number, requestedDate?: string) {
  try { await currentCustomerId(); return { error: null, ...(await recurringStartSlots(serviceId, weekday, requestedDate, true)) }; } catch (error) { return { error: message(error), dateKey: "", slots: [] }; }
}

export async function getAdminRecurringStartSlots(serviceId: string, weekday: number, requestedDate?: string) {
  try { await requireAdminUser(); return { error: null, ...(await recurringStartSlots(serviceId, weekday, requestedDate, false)) }; } catch (error) { return { error: message(error), dateKey: "", slots: [] }; }
}

export async function previewCustomerRecurringBooking(input: RecurringBookingInput) {
  try { await currentCustomerId(); return { error: null, ...(await previewRecurringBooking(input, { enforceCustomerPolicy: true })) }; } catch (error) { return { error: message(error), occurrences: [] }; }
}

export async function createCustomerRecurringBooking(input: RecurringBookingInput) {
  try { const customerId = await currentCustomerId(); const result = await createRecurringBookingSeries({ ...input, customerId }, "customer"); refresh(); return { error: null, result }; } catch (error) { return { error: message(error), result: null }; }
}

export async function manageCustomerRecurringBooking(seriesId: string, action: "pause" | "resume" | "cancel") {
  try { await assertCustomerOwnsSeries(seriesId); await setRecurringBookingState(seriesId, action, "customer"); refresh(); return { error: null }; } catch (error) { return { error: message(error) }; }
}

export async function previewCustomerRecurringRemoval(seriesId: string) {
  try {
    await assertCustomerOwnsSeries(seriesId);
    return { error: null, preview: await previewRecurringBookingRemoval(seriesId) };
  } catch (error) {
    return { error: message(error), preview: null };
  }
}

export async function removeCustomerRecurringBooking(seriesId: string) {
  try {
    await assertCustomerOwnsSeries(seriesId);
    const result = await removeRecurringBookingSeries(seriesId);
    refresh();
    return { error: null, result };
  } catch (error) {
    return { error: message(error), result: null };
  }
}

export async function getCustomerRecurringTemplate(seriesId: string) {
  try {
    await assertCustomerOwnsSeries(seriesId);
    return { error: null, template: await buildRecurringBookingTemplate(seriesId) };
  } catch (error) {
    return { error: message(error), template: null };
  }
}

export async function previewAdminRecurringBooking(input: RecurringBookingInput) {
  try { await requireAdminUser(); if (!input.customerId) throw new Error("Select a customer."); return { error: null, ...(await previewRecurringBooking(input)) }; } catch (error) { return { error: message(error), occurrences: [] }; }
}

export async function createAdminRecurringBooking(input: RecurringBookingInput) {
  try { await requireAdminUser(); if (!input.customerId) throw new Error("Select a customer."); const result = await createRecurringBookingSeries({ ...input, customerId: input.customerId }, "admin"); refresh(); return { error: null, result }; } catch (error) { return { error: message(error), result: null }; }
}

export async function manageAdminRecurringBooking(seriesId: string, action: "pause" | "resume" | "cancel") {
  try { await requireAdminUser(); await setRecurringBookingState(seriesId, action, "admin"); refresh(); return { error: null }; } catch (error) { return { error: message(error) }; }
}

export async function previewAdminRecurringRemoval(seriesId: string) {
  try {
    await requireAdminUser();
    return { error: null, preview: await previewRecurringBookingRemoval(seriesId) };
  } catch (error) {
    return { error: message(error), preview: null };
  }
}

export async function removeAdminRecurringBooking(seriesId: string) {
  try {
    await requireAdminUser();
    const result = await removeRecurringBookingSeries(seriesId);
    refresh();
    return { error: null, result };
  } catch (error) {
    return { error: message(error), result: null };
  }
}

export async function getAdminRecurringTemplate(seriesId: string) {
  try {
    await requireAdminUser();
    return { error: null, template: await buildRecurringBookingTemplate(seriesId) };
  } catch (error) {
    return { error: message(error), template: null };
  }
}

export async function removeAdminRecurringAppointment(appointmentId: string) {
  try {
    await requireAdminUser();
    const result = await removeRecurringAppointmentOccurrence(appointmentId);
    refresh();
    return { error: null, result };
  } catch (error) {
    return { error: message(error), result: null };
  }
}
