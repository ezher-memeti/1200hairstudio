export type AvailabilityExceptionRecord = {
  id: string;
  date: string;
  is_closed: boolean;
  open_time: string | null;
  close_time: string | null;
  reason: string | null;
  created_at: string;
  updated_at: string;
};
