import { createClient } from "@supabase/supabase-js";

type Channel = "email" | "whatsapp";
type ReminderRow = { id: string; appointment_id: string; appointment_start_at: string; channel: Channel; scheduled_for: string; status: string; attempt_count: number | null; updated_at: string };
type Candidate = { appointmentId: string; appointmentStartAt: string; channel: Channel; reminder?: ReminderRow };

const MAX_ATTEMPTS = 3;
const PROCESSING_LOCK_MINUTES = 15;
const RETRY_DELAY_MINUTES = 15;
const PROCESSING_WINDOW_MINUTES = 15;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const safeMessage = (error: unknown) => error instanceof Error ? error.message.slice(0, 500) : "Reminder delivery failed.";
const candidateKey = (candidate: Candidate) => `${candidate.appointmentId}:${candidate.appointmentStartAt}:${candidate.channel}`;

Deno.serve(async (request: Request) => {
  const cronSecret = Deno.env.get("APPOINTMENT_REMINDER_CRON_SECRET");
  const suppliedSecret = request.headers.get("x-cron-secret") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!cronSecret || suppliedSecret !== cronSecret) return json({ error: "Unauthorized" }, 401);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const deliveryUrl = Deno.env.get("REMINDER_DELIVERY_URL");
  const deliverySecret = Deno.env.get("REMINDER_DELIVERY_SECRET");
  if (!supabaseUrl || !serviceRoleKey || !deliveryUrl || !deliverySecret) return json({ error: "Reminder function is not configured" }, 500);

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const result = { examined: 0, claimed: 0, sent: 0, failed: 0, skipped: 0, deliveryAcceptedButUnlogged: 0 };
  try {
    const { data: settings, error: settingsError } = await supabase.from("notification_settings").select("appointment_reminders_enabled,appointment_reminder_hours_before,appointment_reminder_email_enabled,appointment_reminder_whatsapp_enabled").limit(1).maybeSingle();
    if (settingsError) throw settingsError;
    if (!settings?.appointment_reminders_enabled) return json({ ok: true, disabled: true, ...result });
    const hoursBefore = Math.min(720, Math.max(1, Number(settings.appointment_reminder_hours_before ?? 2)));
    const enabledChannels = new Set<Channel>([...(settings.appointment_reminder_email_enabled ? ["email" as const] : []), ...(settings.appointment_reminder_whatsapp_enabled ? ["whatsapp" as const] : [])]);
    if (!enabledChannels.size) return json({ ok: true, channelsDisabled: true, hoursBefore, ...result });

    const now = Date.now();
    const appointmentWindowStart = new Date(now + hoursBefore * 3_600_000).toISOString();
    const appointmentWindowEnd = new Date(now + hoursBefore * 3_600_000 + PROCESSING_WINDOW_MINUTES * 60_000).toISOString();
    const retryBefore = new Date(now - RETRY_DELAY_MINUTES * 60_000).toISOString();
    const staleProcessingBefore = new Date(now - PROCESSING_LOCK_MINUTES * 60_000).toISOString();
    const [appointmentsResult, failedResult, staleResult] = await Promise.all([
      supabase.from("appointments").select("id,start_at").eq("status", "confirmed").gte("start_at", appointmentWindowStart).lt("start_at", appointmentWindowEnd).order("start_at"),
      supabase.from("appointment_reminders").select("id,appointment_id,appointment_start_at,channel,scheduled_for,status,attempt_count,updated_at").eq("status", "failed").lt("attempt_count", MAX_ATTEMPTS).lte("updated_at", retryBefore).order("updated_at"),
      supabase.from("appointment_reminders").select("id,appointment_id,appointment_start_at,channel,scheduled_for,status,attempt_count,updated_at").eq("status", "processing").lte("updated_at", staleProcessingBefore).order("updated_at"),
    ]);
    if (appointmentsResult.error) throw appointmentsResult.error;
    if (failedResult.error) throw failedResult.error;
    if (staleResult.error) throw staleResult.error;

    const candidates = new Map<string, Candidate>();
    for (const appointment of appointmentsResult.data ?? []) for (const channel of enabledChannels) {
      const candidate = { appointmentId: appointment.id, appointmentStartAt: appointment.start_at, channel };
      candidates.set(candidateKey(candidate), candidate);
    }
    for (const reminder of [...(failedResult.data ?? []), ...(staleResult.data ?? [])] as ReminderRow[]) {
      const candidate = { appointmentId: reminder.appointment_id, appointmentStartAt: reminder.appointment_start_at, channel: reminder.channel, reminder };
      if (enabledChannels.has(reminder.channel) && Number(reminder.attempt_count ?? 0) < MAX_ATTEMPTS) candidates.set(candidateKey(candidate), candidate);
    }
    result.examined = candidates.size;

    for (const candidate of candidates.values()) {
      if (!enabledChannels.has(candidate.channel)) { result.skipped += 1; continue; }
      const { data: appointment, error: appointmentError } = await supabase.from("appointments").select("id,start_at,status").eq("id", candidate.appointmentId).maybeSingle();
      if (appointmentError) { console.error("REMINDER APPOINTMENT REVALIDATION ERROR", { appointmentId: candidate.appointmentId, error: appointmentError }); result.failed += 1; continue; }
      if (!appointment || appointment.status !== "confirmed" || appointment.start_at !== candidate.appointmentStartAt || new Date(appointment.start_at).getTime() <= Date.now()) { result.skipped += 1; continue; }

      const identity = { appointment_id: appointment.id, appointment_start_at: appointment.start_at, channel: candidate.channel };
      let existing = candidate.reminder;
      if (!existing) {
        const { data, error } = await supabase.from("appointment_reminders").select("id,appointment_id,appointment_start_at,channel,scheduled_for,status,attempt_count,updated_at").match(identity).maybeSingle();
        if (error) { console.error("REMINDER IDENTITY LOOKUP ERROR", { identity, error }); result.failed += 1; continue; }
        existing = data as ReminderRow | undefined;
      }
      if (existing?.status === "sent" || Number(existing?.attempt_count ?? 0) >= MAX_ATTEMPTS) { result.skipped += 1; continue; }
      const existingUpdatedAt = existing ? new Date(existing.updated_at).getTime() : 0;
      if (existing?.status === "processing" && existingUpdatedAt > now - PROCESSING_LOCK_MINUTES * 60_000) { result.skipped += 1; continue; }
      if (existing?.status === "failed" && existingUpdatedAt > now - RETRY_DELAY_MINUTES * 60_000) { result.skipped += 1; continue; }

      const attemptCount = Number(existing?.attempt_count ?? 0) + 1;
      const scheduledFor = existing?.scheduled_for ?? new Date(new Date(appointment.start_at).getTime() - hoursBefore * 3_600_000).toISOString();
      const claimedAt = new Date().toISOString();
      let reminderId: string | undefined;
      if (existing) {
        const { data: claimed, error: claimError } = await supabase.from("appointment_reminders").update({ status: "processing", scheduled_for: scheduledFor, sent_at: null, error_message: null, attempt_count: attemptCount, updated_at: claimedAt }).eq("id", existing.id).eq("updated_at", existing.updated_at).select("id").maybeSingle();
        if (claimError) { console.error("REMINDER RECLAIM ERROR", { reminderId: existing.id, error: claimError }); result.failed += 1; continue; }
        if (!claimed) { result.skipped += 1; continue; }
        reminderId = claimed.id;
      } else {
        const { data: inserted, error: insertError } = await supabase.from("appointment_reminders").insert({ ...identity, scheduled_for: scheduledFor, status: "processing", sent_at: null, error_message: null, attempt_count: attemptCount, updated_at: claimedAt }).select("id").single();
        if (insertError) { if (insertError.code === "23505") result.skipped += 1; else { console.error("REMINDER CLAIM INSERT ERROR", { identity, error: insertError }); result.failed += 1; } continue; }
        reminderId = inserted?.id;
      }
      if (!reminderId) { console.error("REMINDER CLAIM RETURNED NO ID", { identity }); result.failed += 1; continue; }
      result.claimed += 1;

      if (candidate.channel === "whatsapp") {
        const { error: skippedError } = await supabase.from("appointment_reminders").update({ status: "skipped", sent_at: null, error_message: "WhatsApp delivery is not configured.", updated_at: new Date().toISOString() }).eq("id", reminderId);
        if (skippedError) { console.error("REMINDER SKIPPED STATUS ERROR", { reminderId, error: skippedError }); result.failed += 1; } else result.skipped += 1;
        continue;
      }

      try {
        const response = await fetch(deliveryUrl, { method: "POST", headers: { authorization: `Bearer ${deliverySecret}`, "content-type": "application/json" }, body: JSON.stringify({ appointmentId: appointment.id, appointmentStartAt: appointment.start_at }) });
        if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(typeof payload.error === "string" ? payload.error : `Email endpoint returned ${response.status}`); }
        let sentStatusError: unknown = null;
        for (let logAttempt = 0; logAttempt < 3; logAttempt += 1) {
          const sentAt = new Date().toISOString();
          const { error } = await supabase.from("appointment_reminders").update({ status: "sent", sent_at: sentAt, error_message: null, updated_at: sentAt }).eq("id", reminderId);
          sentStatusError = error;
          if (!error) break;
        }
        if (sentStatusError) { console.error("CRITICAL: REMINDER DELIVERED BUT SENT STATUS COULD NOT BE SAVED", { reminderId, appointmentId: appointment.id, channel: candidate.channel, error: sentStatusError }); result.deliveryAcceptedButUnlogged += 1; }
        else result.sent += 1;
      } catch (deliveryError) {
        const { error: failedStatusError } = await supabase.from("appointment_reminders").update({ status: "failed", sent_at: null, error_message: safeMessage(deliveryError), attempt_count: attemptCount, updated_at: new Date().toISOString() }).eq("id", reminderId);
        if (failedStatusError) console.error("CRITICAL: REMINDER FAILURE STATUS COULD NOT BE SAVED", { reminderId, appointmentId: appointment.id, error: failedStatusError, deliveryError });
        else console.error("REMINDER DELIVERY FAILED", { reminderId, appointmentId: appointment.id, attemptCount, error: deliveryError });
        result.failed += 1;
      }
    }
    return json({ ok: true, hoursBefore, appointmentWindowStart, appointmentWindowEnd, ...result });
  } catch (error) {
    console.error("process-appointment-reminders failed", error);
    return json({ ok: false, error: safeMessage(error), ...result }, 500);
  }
});
