export {
  sendBookingCancellationEmail,
  sendBookingConfirmationEmail,
  sendBookingUpdateEmail,
} from "../gmail";

export type TransactionalEmailKind =
  | "booking_confirmation"
  | "booking_update"
  | "booking_cancellation"
  | "appointment_reminder";
