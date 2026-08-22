export type BusinessHourRecord = {
  id: string;
  day_of_week: number;
  is_closed: boolean;
  open_time: string | null;
  close_time: string | null;
  created_at: string;
  updated_at: string;
};
