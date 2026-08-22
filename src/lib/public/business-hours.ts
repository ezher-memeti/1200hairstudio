import { createClient } from "@/lib/supabase/server";
import type { BusinessHourRecord } from "@/lib/business-hours/types";
export {
  buildBookingDates,
  buildTimeGroups,
  formatBusinessHourRange,
  formatBusinessHourTime,
  getBusinessHourDayLabel,
  getBusinessHourDayLabelUpper,
} from "@/lib/public/business-hours-utils";

export async function getBusinessHours() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_hours")
    .select("*")
    .order("day_of_week", { ascending: true });

  if (error) {
    return [] as BusinessHourRecord[];
  }

  return (data ?? []) as BusinessHourRecord[];
}
