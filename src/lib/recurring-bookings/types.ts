export const RECURRING_FREQUENCIES = ["weekly", "biweekly"] as const;
export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number];

export type RecurringBookingInput = {
  customerId?: string;
  serviceId: string;
  frequency: RecurringFrequency;
  weekday: number;
  startTime: string;
  startsOn: string;
  endsOn?: string | null;
};

export type RecurringOccurrencePreview = {
  occurrenceDate: string;
  startAt: string;
  endAt: string;
  available: boolean;
  reason: string | null;
};

export type RecurringBookingRecord = {
  id: string;
  customer_id: string;
  service_id: string;
  frequency: RecurringFrequency;
  weekday: number;
  start_time: string;
  starts_on: string;
  ends_on: string | null;
  is_active: boolean;
  status: "active" | "paused" | "cancelled";
  total_occurrences: number | null;
  paused_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  service_name?: string;
  customer_name?: string;
  next_appointment_at?: string | null;
};

export type RecurringRemovalPreview = {
  futureAppointments: number;
  removableAppointments: number;
  protectedAppointments: number;
};

export type RecurringBookingTemplate = {
  customerId: string;
  serviceId: string;
  frequency: RecurringFrequency;
  weekday: number;
  startTime: string;
  startsOn: string;
  endsOn: string;
  durationChoice: "3" | "6" | "12" | "custom";
};
