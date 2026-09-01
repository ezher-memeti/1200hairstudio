export type AppointmentStatus =
  | "confirmed"
  | "completed"
  | "cancelled"
  | "no_show";

export type AppointmentRecord = {
  id: string;
  customer_id: string | null;
  service_id: string;
  booking_source?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  start_at: string;
  end_at: string;
  status: AppointmentStatus;
  notes: string | null;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  created_at: string;
  updated_at: string;
};

export type AppointmentWithService = AppointmentRecord & {
  service_name: string;
};

export type CustomerAppointmentSummary = AppointmentRecord & {
  service_name: string;
  date_label: string;
  time_label: string;
  is_upcoming: boolean;
};

export type AdminAppointmentSummary = AppointmentRecord & {
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  booking_type: "customer" | "guest";
  service_name: string;
  date_label: string;
  time_label: string;
};

export type AdminAppointmentDetail = AdminAppointmentSummary;

export type AdminCustomerOption = {
  id: string;
  full_name: string;
  email: string;
  phone: string;
};
