import type { AppointmentRecord } from "@/lib/appointments/types";
import { addDaysToDateKey, getCurrentZurichDateTime } from "@/lib/public/booking-availability-utils";
import type { BookingSettings } from "@/lib/admin/settings";

export type CustomerManagementCapabilities = {
  canReschedule: boolean;
  canCancel: boolean;
  rescheduleBlockedReason: string | null;
  cancellationBlockedReason: string | null;
};

const INACTIVE_REASON = "This booking is past or no longer active.";
const RESCHEDULE_DISABLED_REASON = "Online rescheduling is currently unavailable. Please contact 1200 Hairstudio.";
const CANCELLATION_DISABLED_REASON = "Online cancellation is currently unavailable. Please contact 1200 Hairstudio.";
const CANCELLATION_CUTOFF_REASON = "Online cancellation is no longer available for this appointment. Please contact 1200 Hairstudio.";

export function validateCustomerBookingTime(startAt: string, dateKey: string, settings: BookingSettings, now = new Date()) {
  const startMs = new Date(startAt).getTime();
  if (!Number.isFinite(startMs)) return "Choose a valid appointment time.";

  const earliestMs = now.getTime() + settings.minimumNoticeHours * 60 * 60 * 1000;
  if (startMs < earliestMs) {
    return `Bookings require at least ${settings.minimumNoticeHours} hours notice.`;
  }

  const currentDateKey = getCurrentZurichDateTime(now).dateKey;
  const lastAllowedDateKey = addDaysToDateKey(currentDateKey, settings.maximumHorizonDays);
  if (dateKey < currentDateKey || dateKey > lastAllowedDateKey) {
    return `Bookings are available up to ${settings.maximumHorizonDays} days in advance.`;
  }

  return null;
}

export function getCustomerManagementCapabilities(
  appointment: AppointmentRecord,
  settings: BookingSettings,
  now = new Date(),
): CustomerManagementCapabilities {
  const startMs = new Date(appointment.start_at).getTime();
  const isActive = appointment.status === "confirmed" && startMs > now.getTime();
  const cancellationDeadline = startMs - settings.cancellationCutoffHours * 60 * 60 * 1000;

  return {
    canReschedule: isActive && settings.allowCustomerReschedule,
    canCancel: isActive && settings.allowCustomerCancel && now.getTime() <= cancellationDeadline,
    rescheduleBlockedReason: !isActive ? INACTIVE_REASON : !settings.allowCustomerReschedule ? RESCHEDULE_DISABLED_REASON : null,
    cancellationBlockedReason: !isActive ? INACTIVE_REASON : !settings.allowCustomerCancel ? CANCELLATION_DISABLED_REASON : now.getTime() > cancellationDeadline ? CANCELLATION_CUTOFF_REASON : null,
  };
}
