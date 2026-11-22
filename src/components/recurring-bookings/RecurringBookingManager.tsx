"use client";
import { weekdayLabels } from "@/i18n/format";
import { intlLocale } from "@/i18n/config";
import { useLocale } from "next-intl";

import { useUiText } from "@/i18n/use-ui-text";

import { useTranslations } from "next-intl";


import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import AdminSelect from "@/components/admin/AdminSelect";
import DateTimePicker from "@/components/admin/ui/DateTimePicker";
import { createAdminRecurringBooking, createCustomerRecurringBooking, getAdminRecurringStartSlots, getAdminRecurringTemplate, getCustomerRecurringStartSlots, getCustomerRecurringTemplate, getRecurringWorkingDays, manageAdminRecurringBooking, manageCustomerRecurringBooking, previewAdminRecurringBooking, previewAdminRecurringRemoval, previewCustomerRecurringBooking, previewCustomerRecurringRemoval, removeAdminRecurringBooking, removeCustomerRecurringBooking } from "@/app/actions/recurring-bookings";
import type { RecurringBookingInput, RecurringBookingRecord, RecurringOccurrencePreview, RecurringRemovalPreview } from "@/lib/recurring-bookings/types";

type Option = { id: string; name: string };
type CustomerOption = { id: string; full_name: string; email: string };
type Step = 1 | 2 | 3;
type DurationChoice = "3" | "6" | "12" | "custom";
const formatRecurringDate = (value: string, locale: string) => new Intl.DateTimeFormat(intlLocale(locale), { timeZone: "Europe/Zurich", day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00Z`));
const addMonths = (dateKey: string, months: number) => { const [year, month, day] = dateKey.split("-").map(Number); return new Date(Date.UTC(year, month - 1 + months, day)).toISOString().slice(0, 10); };
const weekdayFromDate = (dateKey: string) => new Date(`${dateKey}T12:00:00Z`).getUTCDay() || 7;

export default function RecurringBookingManager({ mode, services, customers = [], series }: { mode: "customer" | "admin"; services: Option[]; customers?: CustomerOption[]; series: RecurringBookingRecord[] }) {
  const locale = useLocale();
  const dateLabel = (value: string) => formatRecurringDate(value, locale);
  const weekdays = weekdayLabels(locale, "long");

  const uiText = useUiText();

  const ui = useTranslations("ui");
  const audit = useTranslations("audit");

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
      if (reapplyTime && !result.slots.some((slot) => slot.time === reapplyTime)) setFeedback(audit("previousTimeUnavailable", { time: reapplyTime }));
    });
    return () => { active = false; };
  }, [audit, customStart, duration, form.serviceId, form.startsOn, form.weekday, open, openWeekdays, reapplyTime, slotAction, step]);

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
  function manage(id: string, action: "pause" | "resume") { if (action === "pause" && !window.confirm(uiText("Pause this series and cancel its future appointments?"))) return; startTransition(async () => { const result = await manageAction(id, action); setFeedback(result.error ?? (action === "pause" ? "Series paused." : "Series resumed.")); router.refresh(); }); }
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
      setFeedback(audit("futureRemoved", { count: result.result?.removableAppointments ?? 0 }));
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
    return <article key={item.id} className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-3"><p className="break-words text-sm uppercase">{uiText(mode === "admin" ? `${item.customer_name} · ` : "")}{item.service_name}</p><span className="border border-border px-2 py-1 text-[9px] uppercase text-foreground-muted">{item.ends_on && item.ends_on < today && item.status === "active" ? uiText("completed") : item.status}</span></div><p className="mt-2 text-xs text-foreground-muted">{uiText(item.frequency === "weekly" ? "Every week" : "Every 2 weeks")} · {weekdays[item.weekday - 1]} · {item.start_time.slice(0, 5)}</p><p className="mt-1 text-xs text-foreground-muted">{dateLabel(item.starts_on)} – {uiText(item.ends_on ? dateLabel(item.ends_on) : "—")} · {item.total_occurrences ?? 0} {" "}{ui("mc3fed1dae281")}</p>{mode === "admin" ? <p className="mt-1 text-xs text-foreground-secondary">{uiText(item.next_appointment_at ? audit("nextDate", { date: new Intl.DateTimeFormat(intlLocale(locale), { timeZone: "Europe/Zurich", dateStyle: "medium", timeStyle: "short" }).format(new Date(item.next_appointment_at)) }) : "No upcoming appointment")}</p> : null}</div><div className="flex flex-wrap gap-2">{!historical && !item.cancelled_at ? <>{item.is_active ? <button disabled={isPending} onClick={() => manage(item.id, "pause")} className="min-h-11 border border-border px-4 text-[10px] uppercase">{ui("m781961bc81c2")}</button> : <button disabled={isPending} onClick={() => manage(item.id, "resume")} className="min-h-11 border border-accent px-4 text-[10px] uppercase text-accent">{ui("mb3bd0b5a7049")}</button>}<button disabled={isPending} onClick={() => prepareRemoval(item)} className="min-h-11 border border-rose-900/60 px-4 text-[10px] uppercase text-rose-300">{uiText(mode === "admin" ? "Remove This and Future Appointments" : "Remove Regular Booking")}</button></> : null}<button disabled={isPending} onClick={() => reapply(item)} className="min-h-11 border border-border px-4 text-[10px] uppercase text-accent">{ui("maf3f3086e7e9")}</button></div></article>;
  }

  return <section className="min-w-0 border-y border-border py-7">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[10px] uppercase tracking-[.24em] text-accent">{ui("medf126e23aca")}</p><h2 className="mt-2 font-display text-2xl uppercase sm:text-3xl">{ui("m320d00fe58b6")}</h2></div><button onClick={() => setOpen((value) => !value)} className="min-h-11 w-fit border border-accent px-4 text-[10px] uppercase tracking-[.16em] text-accent">{uiText(open ? "Close" : "Set Up Regular Booking")}</button></div>
    {open ? <div className="mt-6 border-t border-border pt-6"><div className="mb-7 flex items-center gap-3">{([1,2,3] as const).map((value) => <div key={value} className={`flex items-center gap-2 text-[9px] uppercase tracking-[.16em] ${step === value ? "text-accent" : "text-foreground-muted"}`}><span className={`flex size-6 items-center justify-center border ${step === value ? "border-accent" : "border-border"}`}>{value}</span>{uiText(value === 1 ? "When" : value === 2 ? "How Often" : "Review")}</div>)}</div>
      {step === 1 ? <div><p className="font-display text-3xl uppercase">{ui("m769bb19e615b")}</p><div className="mt-5 grid gap-5 sm:grid-cols-2">{mode === "admin" ? <AdminSelect label={ui("m0e85749a6f40")} value={form.customerId ?? ""} onChange={(value) => update("customerId", value)} options={customers.map((customer) => ({ value: customer.id, label: `${customer.full_name} · ${customer.email}` }))} placeholder={ui("m6817176b8305")} searchable /> : null}<AdminSelect label={ui("m329cb8b6ba8c")} value={form.serviceId} onChange={(value) => update("serviceId", value)} options={services.map((service) => ({ value: service.id, label: service.name, localize: false }))} /><AdminSelect label={ui("m987b9ced08d4")} value={form.weekday ? String(form.weekday) : ""} onChange={(value) => { update("weekday", Number(value)); setCustomStart(false); }} options={openWeekdays.map((weekday) => ({ value: String(weekday), label: weekdays[weekday - 1] }))} placeholder={uiText(workingDaysLoaded && !openWeekdays.length ? "No working days configured" : "Select working day")} disabled={!workingDaysLoaded || !openWeekdays.length} /></div>{customStart ? <div className="mt-5 max-w-sm"><DateTimePicker mode="date" label={ui("m7725e05476ed")} value={form.startsOn} onChange={selectCustomStart} minDate={today} /></div> : <button onClick={() => setCustomStart(true)} className="mt-4 min-h-11 text-[10px] uppercase tracking-[.15em] text-foreground-muted hover:text-accent">{ui("ma90da6425de1")}</button>}<div className="mt-6"><p className="text-[10px] uppercase tracking-[.18em] text-foreground-muted">{ui("m9cdbf376d050")}{uiText(form.weekday ? ` · ${weekdays[form.weekday - 1]}` : "")}</p><div className="mt-3 flex flex-wrap gap-2">{slots.map((slot) => <button key={slot.slot_start} onClick={() => update("startTime", slot.time)} className={`min-h-11 min-w-20 border px-4 text-sm ${form.startTime === slot.time ? "border-accent bg-accent text-background" : "border-border text-foreground"}`}>{slot.time}</button>)}{!slots.length ? <p className="text-sm text-foreground-muted">{uiText(workingDaysLoaded && !openWeekdays.length ? "No regular working days are configured." : "No available times for this day.")}</p> : null}</div></div><button disabled={isPending || !openWeekdays.includes(form.weekday)} onClick={continueToFrequency} className="mt-7 min-h-12 w-full bg-accent px-5 text-[10px] uppercase tracking-[.18em] text-background disabled:opacity-50 sm:w-auto">{ui("m2e02623966f9")}</button></div> : null}
      {step === 2 ? <div><p className="font-display text-3xl uppercase">{ui("m666951e0c4fe")}</p><div className="mt-5 grid gap-3 sm:grid-cols-2">{([['weekly','Every Week'],['biweekly','Every 2 Weeks']] as const).map(([value,label]) => <button key={value} onClick={() => update("frequency", value)} className={`min-h-16 border px-5 text-left text-sm uppercase ${form.frequency === value ? "border-accent text-accent" : "border-border"}`}>{uiText(label)}</button>)}</div><p className="mt-8 font-display text-2xl uppercase">{ui("m515c46cd219d")}</p><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{([['3','3 Months'],['6','6 Months'],['12','12 Months'],['custom','Custom']] as const).map(([value,label]) => <button key={value} onClick={() => { setDuration(value); if (value !== 'custom') update('endsOn',addMonths(form.startsOn,Number(value))); }} className={`min-h-14 border px-3 text-[10px] uppercase ${duration === value ? "border-accent text-accent" : "border-border"}`}>{uiText(label)}</button>)}</div>{duration === "custom" ? <div className="mt-5 max-w-sm"><DateTimePicker mode="date" label={ui("m84b147812589")} value={form.endsOn ?? ""} onChange={(value) => update("endsOn", value)} minDate={form.startsOn} required /></div> : null}<div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row"><button onClick={() => setStep(1)} className="min-h-12 border border-border px-5 text-[10px] uppercase">{ui("mb52b36b7269f")}</button><button disabled={isPending} onClick={review} className="min-h-12 bg-accent px-5 text-[10px] uppercase tracking-[.18em] text-background">{uiText(isPending ? "Checking…" : "Review Availability")}</button></div></div> : null}
      {step === 3 ? <div><p className="text-[10px] uppercase tracking-[.2em] text-accent">{ui("medf126e23aca")}</p><h3 className="mt-2 font-display text-4xl uppercase">{chosenService}</h3><p className="mt-3 text-sm text-foreground-secondary">{uiText(form.frequency === "weekly" ? "Every week" : "Every 2 weeks")} · {weekdays[form.weekday-1]} · {form.startTime}</p><p className="mt-1 text-sm text-foreground-muted">{ui("mf7880600348a")}{" "}{duration === "custom" ? `${dateLabel(form.startsOn)} – ${dateLabel(form.endsOn!)}` : audit("months", { count: Number(duration) })}</p><div className="mt-6 grid grid-cols-3 border-y border-border py-5 text-center"><div><b className="block font-display text-2xl">{preview.length}</b><span className="text-[9px] uppercase text-foreground-muted">{ui("m1f3f4957c553")}</span></div><div><b className="block font-display text-2xl text-emerald-300">{availableCount}</b><span className="text-[9px] uppercase text-foreground-muted">{ui("m7c62a1424469")}</span></div><div><b className="block font-display text-2xl text-amber-300">{conflicts.length}</b><span className="text-[9px] uppercase text-foreground-muted">{ui("m1d8a49feff71")}</span></div></div>{conflicts.length ? <div className="mt-6"><p className="text-[10px] uppercase tracking-[.18em] text-amber-300">{conflicts.length} {uiText(conflicts.length === 1 ? "Date Needs" : "Dates Need")} {" "}{ui("m74e0b9c80dca")}</p>{conflicts.map((item) => <div key={item.occurrenceDate} className="mt-3 flex flex-col gap-1 border-l border-amber-400/50 pl-4"><span className="text-sm">{dateLabel(item.occurrenceDate)} · {form.startTime}</span><span className="text-xs text-foreground-muted">{item.reason}</span></div>)}<div className="mt-4 flex flex-wrap gap-3"><button onClick={() => setStep(1)} className="min-h-11 border border-border px-4 text-[10px] uppercase">{ui("m3fa13067d187")}</button><span className="flex min-h-11 items-center text-[10px] uppercase text-foreground-muted">{ui("m4a17f3800f51")}</span></div></div> : null}<button onClick={() => setShowAllDates((value) => !value)} className="mt-5 min-h-11 text-[10px] uppercase tracking-[.15em] text-foreground-muted">{uiText(showAllDates ? "Hide All Dates" : "View All Dates →")}</button>{showAllDates ? <div className="max-h-72 divide-y divide-border overflow-y-auto border-y border-border">{preview.map((item) => <div key={item.occurrenceDate} className="flex justify-between gap-4 py-3 text-xs"><span>{dateLabel(item.occurrenceDate)} · {form.startTime}</span><span className={item.available ? "text-emerald-300" : "text-amber-300"}>{uiText(item.available ? "Available" : "Skipped")}</span></div>)}</div> : null}<div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row"><button onClick={() => setStep(2)} className="min-h-12 border border-border px-5 text-[10px] uppercase">{ui("mb52b36b7269f")}</button><button disabled={isPending || availableCount === 0} onClick={create} className="min-h-12 flex-1 bg-accent px-5 text-[10px] uppercase tracking-[.18em] text-background disabled:opacity-50">{ui("m183af43cb20a")}</button></div></div> : null}
      {feedback ? <p className="mt-4 text-sm text-foreground-secondary">{uiText(feedback)}</p> : null}
    </div> : null}
    {mode === "admin" ? <div className="mt-7"><div className="flex items-center gap-5 border-b border-border"><button type="button" onClick={() => setShowHistory(false)} className={`min-h-11 border-b-2 text-[10px] uppercase tracking-[.18em] ${!showHistory ? "border-accent text-accent" : "border-transparent text-foreground-muted"}`}>{ui("ma733b809d2f1")}</button><button type="button" onClick={() => setShowHistory(true)} className={`min-h-11 border-b-2 text-[10px] uppercase tracking-[.18em] ${showHistory ? "border-accent text-accent" : "border-transparent text-foreground-muted"}`}>{ui("m90ccd6497400")}</button></div><div className="divide-y divide-border">{(showHistory ? historicalSeries : currentSeries).map((item) => renderSeriesRow(item, showHistory))}{!(showHistory ? historicalSeries : currentSeries).length ? <p className="py-6 text-sm text-foreground-muted">{uiText(showHistory ? "No previous regular bookings." : "No active regular bookings.")}</p> : null}</div></div> : <><div className="mt-6 divide-y divide-border border-t border-border">{currentSeries.map((item) => renderSeriesRow(item, false))}{!currentSeries.length ? <p className="py-6 text-sm text-foreground-muted">{ui("mc62ac152c801")}</p> : null}</div>{historicalSeries.length ? <div className="mt-5 border-t border-border"><button type="button" onClick={() => setShowHistory((value) => !value)} className="flex min-h-12 w-full items-center justify-between text-left text-[10px] uppercase tracking-[.18em] text-foreground-muted"><span>{ui("me6b525f299ae")}</span><span>{uiText(showHistory ? "Hide" : audit("historyCount", { count: historicalSeries.length }))}</span></button>{showHistory ? <div className="divide-y divide-border">{historicalSeries.map((item) => renderSeriesRow(item, true))}</div> : null}</div> : null}</>}
    {removeTarget ? <div className="fixed inset-0 z-[110] flex items-end justify-center bg-background/85 p-3 backdrop-blur-sm sm:items-center sm:p-6"><div className="admin-scrollbar max-h-[calc(100dvh-24px)] w-full max-w-lg overflow-y-auto overscroll-contain border border-border bg-surface p-5 pb-[max(20px,env(safe-area-inset-bottom))] sm:p-7"><p className="text-[10px] uppercase tracking-[.24em] text-rose-300">{ui("m2909c8c81729")}</p><h3 className="mt-2 font-display text-2xl uppercase sm:text-3xl">{ui("m9a2d34f92c4a")}</h3><p className="mt-4 text-sm leading-6 text-foreground-secondary">{ui("md3b72aa60b5b")}</p><div className="mt-5 border-y border-border py-4"><p className="text-sm uppercase">{removeTarget.service_name}</p><p className="mt-2 text-xs text-foreground-muted">{uiText(removeTarget.frequency === "weekly" ? "Every week" : "Every 2 weeks")} · {weekdays[removeTarget.weekday - 1]} · {removeTarget.start_time.slice(0, 5)}</p>{removalPreview ? <><p className="mt-4 text-sm text-accent">{audit("removalSummary", { count: removalPreview.removableAppointments })}</p>{removalPreview.protectedAppointments ? <p className="mt-2 text-xs leading-5 text-foreground-muted">{audit("protectedSummary", { count: removalPreview.protectedAppointments })}</p> : null}</> : <p className="mt-4 text-sm text-foreground-muted">{ui("m158f8abf6a64")}</p>}</div><div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" disabled={isPending} onClick={() => { setRemoveTarget(null); setRemovalPreview(null); }} className="min-h-12 border border-border px-5 text-[10px] uppercase tracking-[.16em]">{uiText(mode === "admin" ? "Keep Series" : "Keep Booking")}</button><button type="button" disabled={isPending || !removalPreview} onClick={confirmRemoval} className="min-h-12 border border-rose-500/50 px-5 text-[10px] uppercase tracking-[.16em] text-rose-200 disabled:opacity-40">{uiText(isPending ? "Removing…" : removalPreview ? audit("removeAppointments", { count: removalPreview.removableAppointments }) : "Remove Series")}</button></div></div></div> : null}
  </section>;
}
