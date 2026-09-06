import "server-only";

import type { BookingSettings } from "@/lib/admin/settings";
import { getRuntimeSettings } from "@/lib/admin/runtime-settings";

export async function getBookingSettings(): Promise<BookingSettings> {
  return (await getRuntimeSettings()).booking;
}
