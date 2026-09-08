"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import AdminSelect from "@/components/admin/AdminSelect";
import DateTimePicker from "@/components/admin/ui/DateTimePicker";
import { createAdminRecurringBooking, createCustomerRecurringBooking, getAdminRecurringStartSlots, getAdminRecurringTemplate, getCustomerRecurringStartSlots, getCustomerRecurringTemplate, getRecurringWorkingDays, manageAdminRecurringBooking, manageCustomerRecurringBooking, previewAdminRecurringBooking, previewAdminRecurringRemoval, previewCustomerRecurringBooking, previewCustomerRecurringRemoval, removeAdminRecurringBooking, removeCustomerRecurringBooking } from "@/app/actions/recurring-bookings";
import type { RecurringBookingInput, RecurringBookingRecord, RecurringOccurrencePreview, RecurringRemovalPreview } from "@/lib/recurring-bookings/types";

type Option = { id: string; name: string };
type CustomerOption = { id: string; full_name: string; email: string };
type Step = 1 | 2 | 3;
type DurationChoice = "3" | "6" | "12" | "custom";
const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const dateLabel = (value: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Zurich", day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00Z`));
const addMonths = (dateKey: string, months: number) => { const [year, month, day] = dateKey.split("-").map(Number); return new Date(Date.UTC(year, month - 1 + months, day)).toISOString().slice(0, 10); };
const weekdayFromDate = (dateKey: string) => new Date(`${dateKey}T12:00:00Z`).getUTCDay() || 7;

export default function RecurringBookingManager({ mode, services, customers = [], series }: { mode: "customer" | "admin"; services: Option[]; customers?: CustomerOption[]; series: RecurringBookingRecord[] }) {
  const router = useRouter();
  const today = useMemo(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()), []);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [duration, setDuration] = useState<DurationChoice>("6");
  const [customStart, setCustomStart] = useState(false);
  const [showAllDates, setShowAllDates] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [openWeekdays, setOpenWeekdays] = useState<number[]>([]);
  const [workingDaysLoaded, setWorkingDaysLoaded] = useState(false);
  const [slots, setSlots] = useState<{ time: string; slot_start: string; slot_end: string }[]>([]);
  const [preview, setPreview] = useState<RecurringOccurrencePreview[]>([]);
  const [removeTarget, setRemoveTarget] = useState<RecurringBookingRecord | null>(null);
  const [removalPreview, setRemovalPreview] = useState<RecurringRemovalPreview | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [reapplyTime, setReapplyTime] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<RecurringBookingInput>({ customerId: mode === "admin" ? "" : undefined, serviceId: services[0]?.id ?? "", frequency: "weekly", weekday: 0, startTime: "", startsOn: today, endsOn: addMonths(today, 6) });
  const update = <K extends keyof RecurringBookingInput>(key: K, value: RecurringBookingInput[K]) => { setForm((current) => ({ ...current, [key]: value })); setReapplyTime(null); setPreview([]); setFeedback(""); };
  const slotAction = mode === "admin" ? getAdminRecurringStartSlots : getCustomerRecurringStartSlots;
  const previewAction = mode === "admin" ? previewAdminRecurringBooking : previewCustomerRecurringBooking;
  const createAction = mode === "admin" ? createAdminRecurringBooking : createCustomerRecurringBooking;
  const manageAction = mode === "admin" ? manageAdminRecurringBooking : manageCustomerRecurringBooking;
  const availableCount = preview.filter((item) => item.available).length;
  const conflicts = preview.filter((item) => !item.available);
  const chosenService = services.find((service) => service.id === form.serviceId)?.name ?? "Service";
  const currentSeries = series.filter((item) => !item.cancelled_at && (item.status === "active" || item.status === "paused") && (!item.ends_on || item.ends_on >= today));
  const historicalSeries = series.filter((item) => !currentSeries.some((current) => current.id === item.id));

  useEffect(() => {
    if (!open) return;
    let active = true;
    startTransition(async () => {
      const result = await getRecurringWorkingDays();
      if (!active) return;
      setWorkingDaysLoaded(true);
      if (result.error) {
        setOpenWeekdays([]);
        setFeedback(result.error);
        return;
      }
      setOpenWeekdays(result.weekdays);
      setForm((current) => {
        if (result.weekdays.includes(current.weekday)) return current;
        if (current.weekday !== 0) setFeedback("The selected day is no longer a regular studio working day. Choose another day.");
        return { ...current, weekday: result.weekdays[0] ?? 0, startTime: "" };
      });
    });
    return () => { active = false; };
  }, [open]);

  useEffect(() => {
    if (!open || step !== 1 || !form.serviceId || !openWeekdays.includes(form.weekday)) return;
    let active = true;
    startTransition(async () => {
      const result = await slotAction(form.serviceId, form.weekday, customStart ? form.startsOn : undefined);
      if (!active) return;
      if (result.error) { setFeedback(result.error); setSlots([]); return; }
      setSlots(result.slots);
      setForm((current) => ({ ...current, startsOn: result.dateKey, endsOn: duration === "custom" ? current.endsOn : addMonths(result.dateKey, Number(duration)), startTime: reapplyTime ?? (result.slots.some((slot) => slot.time === current.startTime) ? current.startTime : result.slots[0]?.time ?? "") }));
      if (reapplyTime && !result.slots.some((slot) => slot.time === reapplyTime)) setFeedback(`The previous time ${reapplyTime} is not currently available. Choose another time or review it as a conflict.`);
    });
    return () => { active = false; };
  }, [customStart, duration, form.serviceId, form.startsOn, form.weekday, open, openWeekdays, reapplyTime, slotAction, step]);

  function continueToFrequency() { if (!openWeekdays.includes(form.weekday) || !form.serviceId || !form.startTime) return setFeedback("Choose a studio working day and available time."); setFeedback(""); setStep(2); }
  function selectCustomStart(value: string) {
    const weekday = weekdayFromDate(value);
    if (!openWeekdays.includes(weekday)) {
      setForm((current) => ({ ...current, startsOn: value, weekday: 0, startTime: "" }));
      setSlots([]);
      setFeedback("The studio is normally closed on that weekday. Choose another working day.");
      return;
    }
    setForm((current) => ({ ...current, startsOn: value, weekday, startTime: "" }));
    setFeedback("");
  }
  function review() { const endsOn = duration === "custom" ? form.endsOn : addMonths(form.startsOn, Number(duration)); if (!endsOn) return setFeedback("Choose an end date."); const next = { ...form, endsOn }; setForm(next); startTransition(async () => { const result = await previewAction(next); if (result.error) return setFeedback(result.error); setPreview(result.occurrences); setFeedback(""); setStep(3); }); }
  function create() { startTransition(async () => { const result = await createAction(form); if (result.error) return setFeedback(result.error); setFeedback("Regular booking created."); setOpen(false); setStep(1); setPreview([]); router.refresh(); }); }
  function manage(id: string, action: "pause" | "resume") { if (action === "pause" && !window.confirm("Pause this series and cancel its future appointments?")) return; startTransition(async () => { const result = await manageAction(id, action); setFeedback(result.error ?? (action === "pause" ? "Series paused." : "Series resumed.")); router.refresh(); }); }
  function prepareRemoval(item: RecurringBookingRecord) {
    setRemoveTarget(item);
    setRemovalPreview(null);
    startTransition(async () => {
      const result = await (mode === "admin" ? previewAdminRecurringRemoval(item.id) : previewCustomerRecurringRemoval(item.id));
      if (result.error) {
        setFeedback(result.error);
        setRemoveTarget(null);
        return;
      }
      setRemovalPreview(result.preview);
    });
  }
  function confirmRemoval() {
    if (!removeTarget || !removalPreview) return;
    startTransition(async () => {
      const result = await (mode === "admin" ? removeAdminRecurringBooking(removeTarget.id) : removeCustomerRecurringBooking(removeTarget.id));
      if (result.error) return setFeedback(result.error);
      setFeedback(`${result.result?.removableAppointments ?? 0} future appointment${result.result?.removableAppointments === 1 ? "" : "s"} removed. Previous visits remain in history.`);
      setRemoveTarget(null);
      setRemovalPreview(null);
      router.refresh();
    });
  }
  function reapply(item: RecurringBookingRecord) {
    startTransition(async () => {
      const result = await (mode === "admin" ? getAdminRecurringTemplate(item.id) : getCustomerRecurringTemplate(item.id));
      if (result.error || !result.template) return setFeedback(result.error ?? "Unable to reapply this regular booking.");
      const template = result.template;
      setDuration(template.durationChoice);
      setCustomStart(false);
      setReapplyTime(template.startTime);
      setForm({ customerId: mode === "admin" ? template.customerId : undefined, serviceId: template.serviceId, frequency: template.frequency, weekday: template.weekday, startTime: template.startTime, startsOn: template.startsOn, endsOn: template.endsOn });
      setPreview([]);
      setFeedback("Previous regular booking loaded. Review the current availability before confirming.");
      setStep(1);
      setOpen(true);
    });
  }
  function renderSeriesRow(item: RecurringBookingRecord, historical: boolean) {
    return <article key={item.id} className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-3"><p className="break-words text-sm uppercase">{mode === "admin" ? `${item.customer_name} · ` : ""}{item.service_name}</p><span className="border border-border px-2 py-1 text-[9px] uppercase text-foreground-muted">{item.ends_on && item.ends_on < today && item.status === "active" ? "completed" : item.status}</span></div><p className="mt-2 text-xs text-foreground-muted">{item.frequency === "weekly" ? "Every week" : "Every 2 weeks"} · {weekdays[item.weekday - 1]} · {item.start_time.slice(0, 5)}</p><p className="mt-1 text-xs text-foreground-muted">{dateLabel(item.starts_on)} – {item.ends_on ? dateLabel(item.ends_on) : "—"} · {item.total_occurrences ?? 0} reserved</p>{mode === "admin" ? <p className="mt-1 text-xs text-foreground-secondary">{item.next_appointment_at ? `Next: ${new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Zurich", dateStyle: "medium", timeStyle: "short" }).format(new Date(item.next_appointment_at))}` : "No upcoming appointment"}</p> : null}</div><div className="flex flex-wrap gap-2">{!historical && !item.cancelled_at ? <>{item.is_active ? <button disabled={isPending} onClick={() => manage(item.id, "pause")} className="min-h-11 border border-border px-4 text-[10px] uppercase">Pause</button> : <button disabled={isPending} onClick={() => manage(item.id, "resume")} className="min-h-11 border border-accent px-4 text-[10px] uppercase text-accent">Resume</button>}<button disabled={isPending} onClick={() => prepareRemoval(item)} className="min-h-11 border border-rose-900/60 px-4 text-[10px] uppercase text-rose-300">{mode === "admin" ? "Remove This and Future Appointments" : "Remove Regular Booking"}</button></> : null}<button disabled={isPending} onClick={() => reapply(item)} className="min-h-11 border border-border px-4 text-[10px] uppercase text-accent">Reapply Regular Booking →</button></div></article>;
  }

  return <section className="min-w-0 border-y border-border py-7">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[10px] uppercase tracking-[.24em] text-accent">Regular Booking</p><h2 className="mt-2 font-display text-2xl uppercase sm:text-3xl">Keep Your Usual Time Reserved</h2></div><button onClick={() => setOpen((value) => !value)} className="min-h-11 w-fit border border-accent px-4 text-[10px] uppercase tracking-[.16em] text-accent">{open ? "Close" : "Set Up Regular Booking"}</button></div>
    {open ? <div className="mt-6 border-t border-border pt-6"><div className="mb-7 flex items-center gap-3">{([1,2,3] as const).map((value) => <div key={value} className={`flex items-center gap-2 text-[9px] uppercase tracking-[.16em] ${step === value ? "text-accent" : "text-foreground-muted"}`}><span className={`flex size-6 items-center justify-center border ${step === value ? "border-accent" : "border-border"}`}>{value}</span>{value === 1 ? "When" : value === 2 ? "How Often" : "Review"}</div>)}</div>
      {step === 1 ? <div><p className="font-display text-3xl uppercase">When</p><div className="mt-5 grid gap-5 sm:grid-cols-2">{mode === "admin" ? <AdminSelect label="Customer" value={form.customerId ?? ""} onChange={(value) => update("customerId", value)} options={customers.map((customer) => ({ value: customer.id, label: `${customer.full_name} · ${customer.email}` }))} placeholder="Select customer" searchable /> : null}<AdminSelect label="Service" value={form.serviceId} onChange={(value) => update("serviceId", value)} options={services.map((service) => ({ value: service.id, label: service.name }))} /><AdminSelect label="Day" value={form.weekday ? String(form.weekday) : ""} onChange={(value) => { update("weekday", Number(value)); setCustomStart(false); }} options={openWeekdays.map((weekday) => ({ value: String(weekday), label: weekdays[weekday - 1] }))} placeholder={workingDaysLoaded && !openWeekdays.length ? "No working days configured" : "Select working day"} disabled={!workingDaysLoaded || !openWeekdays.length} /></div>{customStart ? <div className="mt-5 max-w-sm"><DateTimePicker mode="date" label="Starting" value={form.startsOn} onChange={selectCustomStart} minDate={today} /></div> : <button onClick={() => setCustomStart(true)} className="mt-4 min-h-11 text-[10px] uppercase tracking-[.15em] text-foreground-muted hover:text-accent">Choose a different start date →</button>}<div className="mt-6"><p className="text-[10px] uppercase tracking-[.18em] text-foreground-muted">Available Times{form.weekday ? ` · ${weekdays[form.weekday - 1]}` : ""}</p><div className="mt-3 flex flex-wrap gap-2">{slots.map((slot) => <button key={slot.slot_start} onClick={() => update("startTime", slot.time)} className={`min-h-11 min-w-20 border px-4 text-sm ${form.startTime === slot.time ? "border-accent bg-accent text-background" : "border-border text-foreground"}`}>{slot.time}</button>)}{!slots.length ? <p className="text-sm text-foreground-muted">{workingDaysLoaded && !openWeekdays.length ? "No regular working days are configured." : "No available times for this day."}</p> : null}</div></div><button disabled={isPending || !openWeekdays.includes(form.weekday)} onClick={continueToFrequency} className="mt-7 min-h-12 w-full bg-accent px-5 text-[10px] uppercase tracking-[.18em] text-background disabled:opacity-50 sm:w-auto">Continue</button></div> : null}
      {step === 2 ? <div><p className="font-display text-3xl uppercase">How Often?</p><div className="mt-5 grid gap-3 sm:grid-cols-2">{([['weekly','Every Week'],['biweekly','Every 2 Weeks']] as const).map(([value,label]) => <button key={value} onClick={() => update("frequency", value)} className={`min-h-16 border px-5 text-left text-sm uppercase ${form.frequency === value ? "border-accent text-accent" : "border-border"}`}>{label}</button>)}</div><p className="mt-8 font-display text-2xl uppercase">For How Long?</p><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{([['3','3 Months'],['6','6 Months'],['12','12 Months'],['custom','Custom']] as const).map(([value,label]) => <button key={value} onClick={() => { setDuration(value); if (value !== 'custom') update('endsOn',addMonths(form.startsOn,Number(value))); }} className={`min-h-14 border px-3 text-[10px] uppercase ${duration === value ? "border-accent text-accent" : "border-border"}`}>{label}</button>)}</div>{duration === "custom" ? <div className="mt-5 max-w-sm"><DateTimePicker mode="date" label="End Date" value={form.endsOn ?? ""} onChange={(value) => update("endsOn", value)} minDate={form.startsOn} required /></div> : null}<div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row"><button onClick={() => setStep(1)} className="min-h-12 border border-border px-5 text-[10px] uppercase">Back</button><button disabled={isPending} onClick={review} className="min-h-12 bg-accent px-5 text-[10px] uppercase tracking-[.18em] text-background">{isPending ? "Checking…" : "Review Availability"}</button></div></div> : null}
      {step === 3 ? <div><p className="text-[10px] uppercase tracking-[.2em] text-accent">Regular Booking</p><h3 className="mt-2 font-display text-4xl uppercase">{chosenService}</h3><p className="mt-3 text-sm text-foreground-secondary">{form.frequency === "weekly" ? "Every week" : "Every 2 weeks"} · {weekdays[form.weekday-1]} · {form.startTime}</p><p className="mt-1 text-sm text-foreground-muted">For {duration === "custom" ? `${dateLabel(form.startsOn)} – ${dateLabel(form.endsOn!)}` : `${duration} months`}</p><div className="mt-6 grid grid-cols-3 border-y border-border py-5 text-center"><div><b className="block font-display text-2xl">{preview.length}</b><span className="text-[9px] uppercase text-foreground-muted">Appointments</span></div><div><b className="block font-display text-2xl text-emerald-300">{availableCount}</b><span className="text-[9px] uppercase text-foreground-muted">Available</span></div><div><b className="block font-display text-2xl text-amber-300">{conflicts.length}</b><span className="text-[9px] uppercase text-foreground-muted">Need Attention</span></div></div>{conflicts.length ? <div className="mt-6"><p className="text-[10px] uppercase tracking-[.18em] text-amber-300">{conflicts.length} {conflicts.length === 1 ? "Date Needs" : "Dates Need"} Attention</p>{conflicts.map((item) => <div key={item.occurrenceDate} className="mt-3 flex flex-col gap-1 border-l border-amber-400/50 pl-4"><span className="text-sm">{dateLabel(item.occurrenceDate)} · {form.startTime}</span><span className="text-xs text-foreground-muted">{item.reason}</span></div>)}<div className="mt-4 flex flex-wrap gap-3"><button onClick={() => setStep(1)} className="min-h-11 border border-border px-4 text-[10px] uppercase">Choose Another Time</button><span className="flex min-h-11 items-center text-[10px] uppercase text-foreground-muted">Unavailable dates will be skipped</span></div></div> : null}<button onClick={() => setShowAllDates((value) => !value)} className="mt-5 min-h-11 text-[10px] uppercase tracking-[.15em] text-foreground-muted">{showAllDates ? "Hide All Dates" : "View All Dates →"}</button>{showAllDates ? <div className="max-h-72 divide-y divide-border overflow-y-auto border-y border-border">{preview.map((item) => <div key={item.occurrenceDate} className="flex justify-between gap-4 py-3 text-xs"><span>{dateLabel(item.occurrenceDate)} · {form.startTime}</span><span className={item.available ? "text-emerald-300" : "text-amber-300"}>{item.available ? "Available" : "Skipped"}</span></div>)}</div> : null}<div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row"><button onClick={() => setStep(2)} className="min-h-12 border border-border px-5 text-[10px] uppercase">Back</button><button disabled={isPending || availableCount === 0} onClick={create} className="min-h-12 flex-1 bg-accent px-5 text-[10px] uppercase tracking-[.18em] text-background disabled:opacity-50">Confirm Regular Booking</button></div></div> : null}
      {feedback ? <p className="mt-4 text-sm text-foreground-secondary">{feedback}</p> : null}
    </div> : null}
    {mode === "admin" ? <div className="mt-7"><div className="flex items-center gap-5 border-b border-border"><button type="button" onClick={() => setShowHistory(false)} className={`min-h-11 border-b-2 text-[10px] uppercase tracking-[.18em] ${!showHistory ? "border-accent text-accent" : "border-transparent text-foreground-muted"}`}>Active</button><button type="button" onClick={() => setShowHistory(true)} className={`min-h-11 border-b-2 text-[10px] uppercase tracking-[.18em] ${showHistory ? "border-accent text-accent" : "border-transparent text-foreground-muted"}`}>History</button></div><div className="divide-y divide-border">{(showHistory ? historicalSeries : currentSeries).map((item) => renderSeriesRow(item, showHistory))}{!(showHistory ? historicalSeries : currentSeries).length ? <p className="py-6 text-sm text-foreground-muted">{showHistory ? "No previous regular bookings." : "No active regular bookings."}</p> : null}</div></div> : <><div className="mt-6 divide-y divide-border border-t border-border">{currentSeries.map((item) => renderSeriesRow(item, false))}{!currentSeries.length ? <p className="py-6 text-sm text-foreground-muted">No active regular bookings.</p> : null}</div>{historicalSeries.length ? <div className="mt-5 border-t border-border"><button type="button" onClick={() => setShowHistory((value) => !value)} className="flex min-h-12 w-full items-center justify-between text-left text-[10px] uppercase tracking-[.18em] text-foreground-muted"><span>Previous Regular Bookings</span><span>{showHistory ? "Hide" : `${historicalSeries.length} View →`}</span></button>{showHistory ? <div className="divide-y divide-border">{historicalSeries.map((item) => renderSeriesRow(item, true))}</div> : null}</div> : null}</>}
    {removeTarget ? <div className="fixed inset-0 z-[110] flex items-end justify-center bg-background/85 p-3 backdrop-blur-sm sm:items-center sm:p-6"><div className="admin-scrollbar max-h-[calc(100dvh-24px)] w-full max-w-lg overflow-y-auto overscroll-contain border border-border bg-surface p-5 pb-[max(20px,env(safe-area-inset-bottom))] sm:p-7"><p className="text-[10px] uppercase tracking-[.24em] text-rose-300">Remove Series</p><h3 className="mt-2 font-display text-2xl uppercase sm:text-3xl">Remove Regular Booking?</h3><p className="mt-4 text-sm leading-6 text-foreground-secondary">This will permanently remove all safe future appointments in this recurring series. Past and completed visits will remain in your history.</p><div className="mt-5 border-y border-border py-4"><p className="text-sm uppercase">{removeTarget.service_name}</p><p className="mt-2 text-xs text-foreground-muted">{removeTarget.frequency === "weekly" ? "Every week" : "Every 2 weeks"} · {weekdays[removeTarget.weekday - 1]} · {removeTarget.start_time.slice(0, 5)}</p>{removalPreview ? <><p className="mt-4 text-sm text-accent">{removalPreview.removableAppointments} future appointment{removalPreview.removableAppointments === 1 ? "" : "s"} will be permanently removed.</p>{removalPreview.protectedAppointments ? <p className="mt-2 text-xs leading-5 text-foreground-muted">{removalPreview.protectedAppointments} future appointment{removalPreview.protectedAppointments === 1 ? " has" : "s have"} financial or loyalty history. {removalPreview.protectedAppointments === 1 ? "It will" : "They will"} be cancelled and retained for audit history.</p> : null}</> : <p className="mt-4 text-sm text-foreground-muted">Checking future reservations…</p>}</div><div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" disabled={isPending} onClick={() => { setRemoveTarget(null); setRemovalPreview(null); }} className="min-h-12 border border-border px-5 text-[10px] uppercase tracking-[.16em]">{mode === "admin" ? "Keep Series" : "Keep Booking"}</button><button type="button" disabled={isPending || !removalPreview} onClick={confirmRemoval} className="min-h-12 border border-rose-500/50 px-5 text-[10px] uppercase tracking-[.16em] text-rose-200 disabled:opacity-40">{isPending ? "Removing…" : removalPreview ? `Remove ${removalPreview.removableAppointments} Appointment${removalPreview.removableAppointments === 1 ? "" : "s"}` : "Remove Series"}</button></div></div></div> : null}
  </section>;
}
