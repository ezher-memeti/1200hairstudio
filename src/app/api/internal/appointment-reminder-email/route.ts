import { NextRequest, NextResponse } from "next/server";

import { sendAppointmentReminderEmail } from "@/lib/email/reminder";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type RequestBody = { appointmentId?: unknown; appointmentStartAt?: unknown };

export async function POST(request: NextRequest) {
  const secret = process.env.REMINDER_DELIVERY_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: RequestBody;
  try { body = await request.json() as RequestBody; } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  if (typeof body.appointmentId !== "string" || typeof body.appointmentStartAt !== "string") return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const admin = createAdminClient();
  const { data: appointment, error } = await admin.from("appointments").select("id,customer_id,service_id,start_at,end_at,status,customer_name,customer_email,guest_name,guest_email").eq("id", body.appointmentId).maybeSingle();
  if (error || !appointment) return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  if (appointment.status !== "confirmed" || appointment.start_at !== body.appointmentStartAt) return NextResponse.json({ error: "Appointment is no longer eligible" }, { status: 409 });
  const [{ data: customer }, { data: service }] = await Promise.all([
    appointment.customer_id ? admin.from("customers").select("full_name,email,is_registered").eq("id", appointment.customer_id).maybeSingle() : Promise.resolve({ data: null }),
    admin.from("services").select("name").eq("id", appointment.service_id).maybeSingle(),
  ]);
  const email = (customer?.email ?? appointment.customer_email ?? appointment.guest_email ?? "").trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "Customer email is unavailable" }, { status: 422 });
  try {
    await sendAppointmentReminderEmail({ to: email, customerName: customer?.full_name ?? appointment.customer_name ?? appointment.guest_name, serviceName: service?.name ?? "Appointment", startAt: appointment.start_at, endAt: appointment.end_at, registeredCustomer: customer?.is_registered === true });
    return NextResponse.json({ ok: true });
  } catch (sendError) {
    console.error("INTERNAL APPOINTMENT REMINDER EMAIL ERROR", { appointmentId: appointment.id, error: sendError });
    return NextResponse.json({ error: "Email delivery failed" }, { status: 502 });
  }
}
