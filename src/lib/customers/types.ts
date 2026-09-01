export type CustomerRecord = {
  id: string;
  profile_id: string | null;
  full_name: string;
  email: string;
  phone: string;
  notes: string | null;
  is_registered: boolean;
  marketing_email_consent: boolean;
  marketing_email_consented_at: string | null;
  marketing_email_consent_source: string | null;
  marketing_email_unsubscribed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminCustomerType = "registered" | "guest";

export type AdminCustomerAppointment = {
  id: string;
  service_id: string;
  service_name: string;
  start_at: string;
  end_at: string;
  status: string;
  booking_source: string | null;
  created_at: string;
  date_label: string;
  time_label: string;
};

export type AdminCustomerDirectoryEntry = {
  id: string;
  type: AdminCustomerType;
  full_name: string;
  email: string;
  phone: string;
  notes: string | null;
  marketing_email_consent: boolean;
  marketing_email_consented_at: string | null;
  marketing_email_consent_source: string | null;
  marketing_email_unsubscribed_at: string | null;
  created_at: string;
  updated_at: string;
  total_appointments: number;
  upcoming_appointment: AdminCustomerAppointment | null;
  last_appointment: AdminCustomerAppointment | null;
  appointment_history: AdminCustomerAppointment[];
};
