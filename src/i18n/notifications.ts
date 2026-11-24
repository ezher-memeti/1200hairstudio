import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { notificationLocale, type Locale } from "./config";
export async function getNotificationLocale(input: { customerId?: string | null; appointmentId?: string | null }): Promise<Locale> {
  const admin = createAdminClient();
  const { data: appointment } = input.appointmentId
    ? await admin.from("appointments").select("booking_locale,customer_id").eq("id", input.appointmentId).maybeSingle()
    : { data: null };
  const customerId = input.customerId ?? appointment?.customer_id;
  const { data: customer } = customerId ? await admin.from("customers").select("preferred_locale").eq("id", customerId).maybeSingle() : { data: null };
  return notificationLocale(customer?.preferred_locale, appointment?.booking_locale);
}
