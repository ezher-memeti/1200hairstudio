import { redirect } from "@/i18n/server";
import { getCurrentUserRole } from "@/lib/auth/customer";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPushId } from "@/lib/push/preferences";
import { getZurichDateKeyFromIso } from "@/lib/appointments/date-utils";

// The payload contains only an opaque event ID. Resolve private destinations after authorization.
export default async function PushDestination({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  if (!isPushId(eventId)) return redirect("/admin");
  const { user, role } = await getCurrentUserRole();
  if (!user) return redirect(`/admin/login?push=${eventId}`);
  if (role !== "admin") return redirect("/account");
  const db = createAdminClient();
  const { data: event } = await db.from("admin_push_events").select("kind,entity_id").eq("id", eventId).maybeSingle();
  if (event?.kind === "customer_registered") {
    const { data } = await db.from("customers").select("id").eq("profile_id", event.entity_id).maybeSingle();
    if (data && isPushId(data.id)) return redirect(`/admin/customers?customerId=${data.id}`);
  }
  if (event?.kind === "appointment_confirmed" || event?.kind === "appointment_completed") {
    const { data } = await db.from("appointments").select("id,start_at").eq("id", event.entity_id).maybeSingle();
    if (data && isPushId(data.id)) return redirect(`/admin/appointments?view=day&date=${getZurichDateKeyFromIso(data.start_at)}&appointmentId=${data.id}`);
  }
  if (event?.kind === "test" && event.entity_id === user.id) return redirect("/admin/site-settings/notifications");
  return redirect("/admin");
}
