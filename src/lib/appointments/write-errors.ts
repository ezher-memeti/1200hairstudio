export type PostgresWriteError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

export const APPOINTMENT_TIME_CONFLICT_MESSAGE =
  "This time is no longer available. Please choose another slot.";

export function isAppointmentTimeConflictError(error: PostgresWriteError | null | undefined) {
  if (!error) return false;
  if (error.code === "23P01") return true;
  if (error.code !== "23505") return false;

  const description = [error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ");

  return /appointments_recurring_occurrence_unique|recurring_booking_id.*recurring_occurrence_date/i.test(
    description,
  );
}

export function getAppointmentWriteErrorMessage(error: PostgresWriteError) {
  return isAppointmentTimeConflictError(error)
    ? APPOINTMENT_TIME_CONFLICT_MESSAGE
    : "Unable to create the appointment right now. Please try again.";
}
