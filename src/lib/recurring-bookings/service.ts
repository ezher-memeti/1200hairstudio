import "server-only";

import { getUtcIsoForZurichDateTime } from "@/lib/appointments/availability";
import { createBookingCredentials } from "@/lib/appointments/management";
import { getAvailableSlots } from "@/lib/public/available-slots";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateRecurringDates, weekdayForDateKey } from "@/lib/recurring-bookings/generator";
import { RECURRING_FREQUENCIES, type RecurringBookingInput, type RecurringBookingRecord, type RecurringBookingTemplate, type RecurringOccurrencePreview, type RecurringRemovalPreview } from "@/lib/recurring-bookings/types";
import { getRuntimeSettings } from "@/lib/admin/runtime-settings";
import { getOpenBusinessWeekdays } from "@/lib/public/business-hours-utils";
import { addDaysToDateKey, getCurrentZurichDateTime, getWeekdayNumber, parseDateKey } from "@/lib/public/booking-availability-utils";
import { sendRecurringBookingConfirmationEmail, sendRecurringBookingPausedEmail, sendRecurringBookingRemovedEmail, sendRecurringBookingResumedEmail, type RecurringEmailDetails } from "@/lib/email/recurring";

function validateInput(input: RecurringBookingInput) {
  if (!input.serviceId || !RECURRING_FREQUENCIES.includes(input.frequency) || input.weekday < 1 || input.weekday > 7 || !/^\d{2}:\d{2}$/.test(input.startTime) || !/^\d{4}-\d{2}-\d{2}$/.test(input.startsOn) || !input.endsOn || !/^\d{4}-\d{2}-\d{2}$/.test(input.endsOn)) throw new Error("Complete all recurring booking fields, including an end date.");
  if (input.endsOn < input.startsOn) throw new Error("End date must be after the start date.");
}

function zurichTime(iso: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

async function getRecurringEmailDetails(series: RecurringBookingRecord): Promise<RecurringEmailDetails | null> {
  const admin = createAdminClient();
  const [{ data: customer }, { data: service }, { data: appointments }] = await Promise.all([
    admin.from("customers").select("full_name,email").eq("id", series.customer_id).maybeSingle(),
    admin.from("services").select("name").eq("id", series.service_id).maybeSingle(),
    admin.from("appointments").select("start_at").eq("recurring_booking_id", series.id).eq("status", "confirmed").gt("start_at", new Date().toISOString()).order("start_at", { ascending: true }),
  ]);
  if (!customer?.email || !service || !series.ends_on) return null;
  return { to: customer.email, customerId: series.customer_id, recurringBookingId: series.id, customerName: customer.full_name, serviceName: service.name, frequency: series.frequency, weekday: series.weekday, startTime: series.start_time.slice(0, 5), startsOn: series.starts_on, endsOn: series.ends_on, reservedCount: appointments?.length ?? 0, upcomingAppointments: (appointments ?? []).map((appointment) => ({ startAt: appointment.start_at })) };
}

async function sendRecurringNotification(event: "paused" | "resumed" | "removed", details: RecurringEmailDetails | null) {
  if (!details) return;
  const { notifications } = await getRuntimeSettings();
  const enabled = event === "removed" || event === "paused" ? notifications.cancellationEmail : notifications.rescheduleEmail;
  if (!enabled) return;
  try {
    if (event === "paused") await sendRecurringBookingPausedEmail(details);
    else if (event === "resumed") await sendRecurringBookingResumedEmail(details);
    else await sendRecurringBookingRemovedEmail(details);
  } catch (error) {
    console.error("RECURRING BOOKING EMAIL ERROR", { event, error });
  }
}

export async function getRecurringOpenBusinessWeekdays() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("business_hours")
    .select("day_of_week,is_closed,open_time,close_time")
    .order("day_of_week", { ascending: true });
  if (error) throw new Error("Unable to load studio working days.");
  return getOpenBusinessWeekdays(data ?? []);
}

function addMonthsToDateKey(dateKey: string, months: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + months, day)).toISOString().slice(0, 10);
}

export async function buildRecurringBookingTemplate(seriesId: string): Promise<RecurringBookingTemplate> {
  const admin = createAdminClient();
  const { data: series, error } = await admin.from("recurring_bookings").select("customer_id,service_id,frequency,weekday,start_time,starts_on,ends_on").eq("id", seriesId).maybeSingle();
  if (error || !series) throw new Error("Recurring booking not found.");
  const today = getCurrentZurichDateTime().dateKey;
  const todayDate = parseDateKey(today);
  if (!todayDate) throw new Error("Unable to calculate a new recurring start date.");
  const startsOn = addDaysToDateKey(today, (series.weekday - getWeekdayNumber(todayDate) + 7) % 7);
  const knownDuration = ([3, 6, 12] as const).find((months) => series.ends_on === addMonthsToDateKey(series.starts_on, months));
  const oldStartMs = new Date(`${series.starts_on}T12:00:00Z`).getTime();
  const oldEndMs = series.ends_on ? new Date(`${series.ends_on}T12:00:00Z`).getTime() : oldStartMs;
  const durationDays = Math.max(1, Math.round((oldEndMs - oldStartMs) / 86_400_000));
  const durationChoice = knownDuration ? String(knownDuration) as "3" | "6" | "12" : "custom";
  return {
    customerId: series.customer_id,
    serviceId: series.service_id,
    frequency: series.frequency,
    weekday: series.weekday,
    startTime: series.start_time.slice(0, 5),
    startsOn,
    endsOn: knownDuration ? addMonthsToDateKey(startsOn, knownDuration) : addDaysToDateKey(startsOn, durationDays),
    durationChoice,
  };
}

export async function previewRecurringBooking(input: RecurringBookingInput, options?: { enforceCustomerPolicy?: boolean; fromDate?: string | null }) {
  validateInput(input);
  const openWeekdays = await getRecurringOpenBusinessWeekdays();
  if (!openWeekdays.includes(input.weekday)) throw new Error("Choose one of the studio's regular working days.");
  const dates = generateRecurringDates({ startsOn: input.startsOn, endsOn: input.endsOn!, frequency: input.frequency, weekday: input.weekday, fromDate: options?.fromDate });
  const occurrences = await Promise.all(dates.map(async (occurrenceDate): Promise<RecurringOccurrencePreview> => {
    const slots = await getAvailableSlots(input.serviceId, occurrenceDate, {
      enforceCustomerPolicy: options?.enforceCustomerPolicy === true,
      bookingContext: "recurring",
    });
    const slot = slots.find((candidate) => zurichTime(candidate.slot_start) === input.startTime);
    if (slot) return { occurrenceDate, startAt: slot.slot_start, endAt: slot.slot_end, available: true, reason: null };
    const startAt = getUtcIsoForZurichDateTime(occurrenceDate, input.startTime);
    return { occurrenceDate, startAt, endAt: startAt, available: false, reason: "Time unavailable or studio closed" };
  }));
  return { occurrences };
}

async function generateOccurrences(series: RecurringBookingRecord, bookingSource: "admin" | "customer", fromDate?: string | null) {
  const admin = createAdminClient();
  const [{ data: customer }, { data: service }] = await Promise.all([
    admin.from("customers").select("id,full_name,email,phone").eq("id", series.customer_id).maybeSingle(),
    admin.from("services").select("id,name,price,is_active").eq("id", series.service_id).maybeSingle(),
  ]);
  if (!customer || !service?.is_active) throw new Error("Customer or service is unavailable.");
  if (!series.ends_on) throw new Error("Recurring booking has no end date.");
  const preview = await previewRecurringBooking(
    { customerId: series.customer_id, serviceId: series.service_id, frequency: series.frequency, weekday: series.weekday, startTime: series.start_time.slice(0, 5), startsOn: series.starts_on, endsOn: series.ends_on },
    { fromDate, enforceCustomerPolicy: bookingSource === "customer" },
  );
  let createdCount = 0;
  for (const occurrence of preview.occurrences) {
    if (!occurrence.available) {
      const { error } = await admin.from("recurring_booking_conflicts").upsert({ recurring_booking_id: series.id, occurrence_date: occurrence.occurrenceDate, reason: occurrence.reason ?? "Unavailable", status: "unresolved" }, { onConflict: "recurring_booking_id,occurrence_date", ignoreDuplicates: true });
      if (error && error.code !== "23505") throw error;
      continue;
    }
    const credentials = createBookingCredentials();
    const price = Number(service.price);
    const { data: existingOccurrence } = await admin.from("appointments").select("id,status").eq("recurring_booking_id", series.id).eq("recurring_occurrence_date", occurrence.occurrenceDate).maybeSingle();
    if (existingOccurrence) {
      if (existingOccurrence.status === "cancelled") {
        const { error: restoreError } = await admin.from("appointments").update({ start_at: occurrence.startAt, end_at: occurrence.endAt, status: "confirmed", cancelled_at: null, updated_at: new Date().toISOString() }).eq("id", existingOccurrence.id).eq("status", "cancelled");
        if (restoreError) throw restoreError;
      }
      continue;
    }
    const { error } = await admin.from("appointments").insert({ customer_id: customer.id, service_id: service.id, booking_source: bookingSource, customer_name: customer.full_name, customer_email: customer.email || null, customer_phone: customer.phone || null, start_at: occurrence.startAt, end_at: occurrence.endAt, status: "confirmed", original_price: price, discount_amount: 0, final_price: price, promotion_id: null, discount_source: null, discount_label: null, discount_type: null, discount_value: null, booking_reference: credentials.bookingReference, manage_token_hash: credentials.managementTokenHash, recurring_booking_id: series.id, recurring_occurrence_date: occurrence.occurrenceDate });
    if (error && error.code !== "23505") throw error;
    if (!error) createdCount += 1;
  }
  const { count: totalOccurrences } = await admin.from("appointments").select("id", { count: "exact", head: true }).eq("recurring_booking_id", series.id).neq("status", "cancelled");
  const { error: updateError } = await admin.from("recurring_bookings").update({ total_occurrences: totalOccurrences ?? createdCount, updated_at: new Date().toISOString() }).eq("id", series.id);
  if (updateError) throw updateError;
  return preview;
}

export async function createRecurringBookingSeries(input: RecurringBookingInput & { customerId: string }, bookingSource: "admin" | "customer") {
  validateInput(input);
  if (weekdayForDateKey(input.startsOn) !== input.weekday) throw new Error("Starting date must match the selected weekday.");
  const openWeekdays = await getRecurringOpenBusinessWeekdays();
  if (!openWeekdays.includes(input.weekday)) throw new Error("Choose one of the studio's regular working days.");
  const admin = createAdminClient();
  const { data: series, error } = await admin.from("recurring_bookings").insert({ customer_id: input.customerId, service_id: input.serviceId, frequency: input.frequency, weekday: input.weekday, start_time: input.startTime, starts_on: input.startsOn, ends_on: input.endsOn, is_active: true, status: "active", total_occurrences: 0 }).select("*").single();
  if (error || !series) throw error ?? new Error("Unable to create recurring booking.");
  const preview = await generateOccurrences(series as RecurringBookingRecord, bookingSource);
  try {
    const [details, runtimeSettings] = await Promise.all([
      getRecurringEmailDetails(series as RecurringBookingRecord),
      getRuntimeSettings(),
    ]);
    const reserved = preview.occurrences.filter((occurrence) => occurrence.available);
    if (runtimeSettings.notifications.bookingConfirmationEmail && details) {
      await sendRecurringBookingConfirmationEmail({ ...details, reservedCount: reserved.length, conflictCount: preview.occurrences.length - reserved.length, upcomingAppointments: reserved.map((occurrence) => ({ startAt: occurrence.startAt })) });
    }
  } catch (notificationError) {
    console.error("RECURRING BOOKING SUMMARY EMAIL ERROR", { recurringBookingId: series.id, error: notificationError });
  }
  return { series: series as RecurringBookingRecord, ...preview };
}

export async function setRecurringBookingState(seriesId: string, action: "pause" | "resume" | "cancel", bookingSource: "admin" | "customer") {
  const admin = createAdminClient();
  const { data: existingSeries } = await admin.from("recurring_bookings").select("*").eq("id", seriesId).maybeSingle();
  if (!existingSeries) throw new Error("Recurring booking not found.");
  const emailDetails = await getRecurringEmailDetails(existingSeries as RecurringBookingRecord);
  const now = new Date().toISOString();
  const payload = action === "pause" ? { is_active: false, status: "paused", paused_at: now, updated_at: now } : action === "resume" ? { is_active: true, status: "active", paused_at: null, updated_at: now } : { is_active: false, status: "cancelled", cancelled_at: now, updated_at: now };
  const { data, error } = await admin.from("recurring_bookings").update(payload).eq("id", seriesId).select("*").single();
  if (error || !data) throw error ?? new Error("Unable to update recurring booking.");
  if (action === "cancel" || action === "pause") await admin.from("appointments").update({ status: "cancelled", cancelled_at: now, updated_at: now }).eq("recurring_booking_id", seriesId).eq("status", "confirmed").gt("start_at", now);
  if (action === "resume") {
    await generateOccurrences(data as RecurringBookingRecord, bookingSource, new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()));
    await sendRecurringNotification("resumed", await getRecurringEmailDetails(data as RecurringBookingRecord));
  } else if (action === "pause") {
    await sendRecurringNotification("paused", emailDetails);
  }
  return data as RecurringBookingRecord;
}

async function getProtectedRecurringAppointmentIds(appointmentIds: string[]) {
  const protectedIds = new Set<string>();
  if (!appointmentIds.length) return protectedIds;
  const admin = createAdminClient();
  const [paymentResult, receiptResult, loyaltyVisitResult, loyaltyRewardResult] = await Promise.all([
    admin.from("payments").select("appointment_id").in("appointment_id", appointmentIds),
    admin.from("receipts").select("appointment_id").in("appointment_id", appointmentIds),
    admin.from("loyalty_visits").select("appointment_id").in("appointment_id", appointmentIds),
    admin.from("loyalty_rewards").select("redeemed_appointment_id").in("redeemed_appointment_id", appointmentIds),
  ]);
  if (paymentResult.error || receiptResult.error || loyaltyVisitResult.error || loyaltyRewardResult.error) {
    throw new Error("Unable to verify financial and loyalty history for these appointments.");
  }
  const payments = paymentResult.data;
  const receipts = receiptResult.data;
  const loyaltyVisits = loyaltyVisitResult.data;
  const loyaltyRewards = loyaltyRewardResult.data;
  for (const row of payments ?? []) if (row.appointment_id) protectedIds.add(row.appointment_id);
  for (const row of receipts ?? []) if (row.appointment_id) protectedIds.add(row.appointment_id);
  for (const row of loyaltyVisits ?? []) if (row.appointment_id) protectedIds.add(row.appointment_id);
  for (const row of loyaltyRewards ?? []) if (row.redeemed_appointment_id) protectedIds.add(row.redeemed_appointment_id);
  return protectedIds;
}

async function getRecurringRemovalCandidates(seriesId: string) {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("appointments")
    .select("id,status,start_at")
    .eq("recurring_booking_id", seriesId)
    .gt("start_at", now)
    .neq("status", "completed");
  if (error) throw new Error("Unable to inspect future recurring appointments.");
  const appointments = data ?? [];
  const protectedIds = await getProtectedRecurringAppointmentIds(appointments.map((appointment) => appointment.id));
  const removableIds = appointments.filter((appointment) => !protectedIds.has(appointment.id)).map((appointment) => appointment.id);
  return { appointments, removableIds, protectedIds };
}

export async function previewRecurringBookingRemoval(seriesId: string): Promise<RecurringRemovalPreview> {
  const { appointments, removableIds, protectedIds } = await getRecurringRemovalCandidates(seriesId);
  return {
    futureAppointments: appointments.length,
    removableAppointments: removableIds.length,
    protectedAppointments: protectedIds.size,
  };
}

export async function removeRecurringAppointmentOccurrence(appointmentId: string) {
  const admin = createAdminClient();
  const { data: appointment, error } = await admin
    .from("appointments")
    .select("id,status,start_at,recurring_booking_id")
    .eq("id", appointmentId)
    .maybeSingle();
  if (error || !appointment?.recurring_booking_id) throw new Error("Recurring appointment not found.");
  if (appointment.status === "completed" || new Date(appointment.start_at).getTime() <= Date.now()) {
    throw new Error("Past or completed appointments cannot be removed.");
  }
  const protectedIds = await getProtectedRecurringAppointmentIds([appointment.id]);
  if (protectedIds.has(appointment.id)) throw new Error("This appointment has financial or loyalty history and cannot be removed.");
  const { data: deleted, error: deleteError } = await admin
    .from("appointments")
    .delete()
    .eq("id", appointment.id)
    .select("id")
    .maybeSingle();
  if (deleteError || !deleted) throw new Error("Unable to remove this appointment.");
  return { appointmentId: deleted.id, recurringBookingId: appointment.recurring_booking_id };
}

export async function removeRecurringBookingSeries(seriesId: string) {
  const admin = createAdminClient();
  const { data: series, error: seriesError } = await admin.from("recurring_bookings").select("*").eq("id", seriesId).maybeSingle();
  if (seriesError || !series) throw new Error("Recurring booking not found.");
  const emailDetails = await getRecurringEmailDetails(series as RecurringBookingRecord);
  const preview = await previewRecurringBookingRemoval(seriesId);
  const { removableIds, protectedIds } = await getRecurringRemovalCandidates(seriesId);
  const now = new Date().toISOString();
  const { data: disabledSeries, error: disableError } = await admin
    .from("recurring_bookings")
    .update({ is_active: false, status: "cancelled", cancelled_at: now, updated_at: now })
    .eq("id", seriesId)
    .select("id")
    .maybeSingle();
  if (disableError || !disabledSeries) throw new Error("Unable to deactivate the recurring booking.");
  if (removableIds.length) {
    const { error: deleteError } = await admin.from("appointments").delete().in("id", removableIds);
    if (deleteError) throw new Error("The series was stopped, but its future appointments could not all be removed.");
  }
  if (protectedIds.size) {
    const { error: preserveError } = await admin
      .from("appointments")
      .update({ status: "cancelled", cancelled_at: now, updated_at: now })
      .in("id", Array.from(protectedIds));
    if (preserveError) throw new Error("Protected future appointments could not be removed from the active schedule.");
  }
  const currentDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const { error: conflictError } = await admin
    .from("recurring_booking_conflicts")
    .delete()
    .eq("recurring_booking_id", seriesId)
    .gte("occurrence_date", currentDate)
    .eq("status", "unresolved");
  if (conflictError) throw new Error("The series was removed, but future conflict records could not be cleared.");
  await sendRecurringNotification("removed", emailDetails ? { ...emailDetails, removedCount: preview.futureAppointments } : null);
  return preview;
}

export async function getRecurringBookings(customerId?: string) {
  const admin = createAdminClient();
  let query = admin.from("recurring_bookings").select("*").order("created_at", { ascending: false });
  if (customerId) query = query.eq("customer_id", customerId);
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as RecurringBookingRecord[];
  const serviceIds = Array.from(new Set(rows.map((row) => row.service_id)));
  const customerIds = Array.from(new Set(rows.map((row) => row.customer_id)));
  const [{ data: services }, { data: customers }, { data: appointments }] = await Promise.all([
    serviceIds.length ? admin.from("services").select("id,name").in("id", serviceIds) : Promise.resolve({ data: [] }),
    customerIds.length ? admin.from("customers").select("id,full_name").in("id", customerIds) : Promise.resolve({ data: [] }),
    rows.length ? admin.from("appointments").select("recurring_booking_id,start_at").in("recurring_booking_id", rows.map((row) => row.id)).eq("status", "confirmed").gt("start_at", new Date().toISOString()).order("start_at", { ascending: true }) : Promise.resolve({ data: [] }),
  ]);
  const serviceNames = new Map((services ?? []).map((row) => [row.id, row.name]));
  const customerNames = new Map((customers ?? []).map((row) => [row.id, row.full_name]));
  const nextBySeries = new Map<string, string>();
  for (const appointment of appointments ?? []) if (appointment.recurring_booking_id && !nextBySeries.has(appointment.recurring_booking_id)) nextBySeries.set(appointment.recurring_booking_id, appointment.start_at);
  return rows.map((row) => ({ ...row, service_name: serviceNames.get(row.service_id) ?? "Service", customer_name: customerNames.get(row.customer_id) ?? "Customer", next_appointment_at: nextBySeries.get(row.id) ?? null }));
}
