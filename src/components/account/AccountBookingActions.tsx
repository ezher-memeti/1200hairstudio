"use client";
import { useUiText } from "@/i18n/use-ui-text";

import { useTranslations } from "next-intl";


import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import {
  cancelAccountBooking,
  getAccountBookingSlots,
  removeAccountRecurringAppointment,
  rescheduleAccountBooking,
} from "@/app/account/actions";
import type { CustomerManagementCapabilities } from "@/lib/booking/policy";

type DateOption = { id: string; day: string; date: string; month: string };
type Slot = { time: string; slot_start: string; slot_end: string };

export default function AccountBookingActions({
  appointmentId,
  recurringBookingId,
  dates,
  capabilities,
}: {
  appointmentId: string;
  recurringBookingId?: string | null;
  dates: DateOption[];
  capabilities: CustomerManagementCapabilities;
}) {
  const uiText = useUiText();

  const ui = useTranslations("ui");

  const router = useRouter();
  const [mode, setMode] = useState<"closed" | "reschedule" | "cancel" | "remove">("closed");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [feedback, setFeedback] = useState("");
  const [isPending, startTransition] = useTransition();

  function chooseDate(dateKey: string) {
    setSelectedDate(dateKey);
    setSelectedTime("");
    setFeedback("");
    startTransition(async () => {
      const result = await getAccountBookingSlots(appointmentId, dateKey);
      setSlots(result.slots);
      if (result.error) setFeedback(result.error);
      else if (!result.slots.length) setFeedback("No available times on this date.");
    });
  }

  function reschedule() {
    if (!selectedDate || !selectedTime) return;
    setFeedback("");
    startTransition(async () => {
      const result = await rescheduleAccountBooking(appointmentId, selectedDate, selectedTime);
      if (result.error) {
        setFeedback(result.error);
        return;
      }
      setFeedback(result.emailWarning ?? "Your booking has been updated.");
      setMode("closed");
      router.refresh();
    });
  }

  function cancel() {
    setFeedback("");
    startTransition(async () => {
      const result = await cancelAccountBooking(appointmentId);
      if (result.error) {
        setFeedback(result.error);
        return;
      }
      setFeedback(result.emailWarning ?? "Your booking has been cancelled.");
      router.refresh();
    });
  }

  function removeOccurrence() {
    setFeedback("");
    startTransition(async () => {
      const result = await removeAccountRecurringAppointment(appointmentId);
      if (result.error) {
        setFeedback(result.error);
        return;
      }
      setFeedback("This appointment was removed. Your regular booking remains active.");
      setMode("closed");
      router.refresh();
    });
  }

  return (
    <div className="mt-5 border-t border-border pt-4">
      {capabilities.canReschedule || capabilities.canCancel || recurringBookingId ? <div className="grid gap-2 sm:flex sm:flex-wrap">
        {capabilities.canReschedule ? <button type="button" onClick={() => setMode("reschedule")} className="min-h-11 border border-border px-4 font-primary text-[10px] uppercase tracking-[0.18em] text-foreground-secondary transition-colors hover:text-foreground">{ui("m798b310a8a65")}</button> : null}
        {capabilities.canCancel || recurringBookingId ? <button type="button" onClick={() => setMode(recurringBookingId ? "remove" : "cancel")} className="min-h-11 border border-border px-4 font-primary text-[10px] uppercase tracking-[0.18em] text-foreground-secondary transition-colors hover:text-foreground">{uiText(recurringBookingId ? "Remove This Appointment" : "Cancel Booking")}</button> : null}
      </div> : <div className="space-y-1 border-l border-accent pl-3 text-sm leading-6 text-foreground-secondary">{Array.from(new Set([capabilities.rescheduleBlockedReason, capabilities.cancellationBlockedReason].filter(Boolean))).map((reason) => <p key={reason}>{uiText(reason)}</p>)}</div>}
      {capabilities.canReschedule || capabilities.canCancel || recurringBookingId ? <div className="mt-3 space-y-1 text-sm leading-6 text-foreground-secondary">{!capabilities.canReschedule && capabilities.rescheduleBlockedReason ? <p>{capabilities.rescheduleBlockedReason}</p> : null}{!recurringBookingId && !capabilities.canCancel && capabilities.cancellationBlockedReason ? <p>{capabilities.cancellationBlockedReason}</p> : null}</div> : null}

      {mode === "reschedule" ? (
        <div className="mt-4 space-y-5 border border-border bg-background p-4 sm:p-5">
          <div><p className="font-primary text-[10px] uppercase tracking-[0.2em] text-foreground-muted">{ui("m8fbf276f33a0")}</p><div className="mt-3 flex gap-2 overflow-x-auto pb-2">{dates.map((date) => <button key={date.id} type="button" disabled={isPending} onClick={() => chooseDate(date.id)} className={`min-w-16 border px-2 py-3 text-center ${selectedDate === date.id ? "border-accent bg-accent text-background" : "border-border text-foreground"}`}><span className="block font-primary text-[8px] uppercase tracking-[0.16em]">{date.day}</span><span className="mt-1 block font-display text-xl">{date.date}</span><span className="block font-primary text-[8px] uppercase tracking-[0.16em]">{date.month}</span></button>)}</div></div>
          {slots.length ? <div><p className="font-primary text-[10px] uppercase tracking-[0.2em] text-foreground-muted">{ui("md136c4ce74b3")}</p><div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">{slots.map((slot) => <button key={slot.slot_start} type="button" onClick={() => setSelectedTime(slot.time)} className={`min-h-10 border font-primary text-xs ${selectedTime === slot.time ? "border-accent bg-accent text-background" : "border-border text-foreground"}`}>{slot.time}</button>)}</div></div> : null}
          <div className="flex flex-col gap-2 sm:flex-row"><button type="button" disabled={isPending || !selectedDate || !selectedTime} onClick={reschedule} className="min-h-11 bg-accent px-4 font-primary text-[10px] uppercase tracking-[0.18em] text-background disabled:opacity-40">{uiText(isPending ? "Updating..." : "Confirm New Time")}</button><button type="button" disabled={isPending} onClick={() => setMode("closed")} className="min-h-11 border border-border px-4 font-primary text-[10px] uppercase tracking-[0.18em] text-foreground-secondary">{ui("mbbfa773e5a63")}</button></div>
        </div>
      ) : null}

      {mode === "cancel" ? (
        <div className="mt-4 border border-border bg-background p-4 sm:p-5"><p className="font-display text-xl uppercase text-foreground">{ui("m0f17b0424da1")}</p><p className="mt-2 font-primary text-sm leading-6 text-foreground-secondary">{ui("mc257624c697c")}</p><div className="mt-4 flex flex-col gap-2 sm:flex-row"><button type="button" disabled={isPending} onClick={cancel} className="min-h-11 bg-accent px-4 font-primary text-[10px] uppercase tracking-[0.18em] text-background disabled:opacity-50">{uiText(isPending ? "Cancelling..." : "Confirm Cancellation")}</button><button type="button" disabled={isPending} onClick={() => setMode("closed")} className="min-h-11 border border-border px-4 font-primary text-[10px] uppercase tracking-[0.18em] text-foreground-secondary">{ui("m6f60eee03e5f")}</button></div></div>
      ) : null}

      {mode === "remove" ? (
        <div className="mt-4 border border-border bg-background p-4 sm:p-5"><p className="font-display text-xl uppercase text-foreground">{ui("m88a0128cfcaf")}</p><p className="mt-2 font-primary text-sm leading-6 text-foreground-secondary">{ui("m1a03ef44986c")}</p><div className="mt-4 flex flex-col gap-2 sm:flex-row"><button type="button" disabled={isPending} onClick={removeOccurrence} className="min-h-11 border border-rose-500/50 px-4 font-primary text-[10px] uppercase tracking-[0.18em] text-rose-200 disabled:opacity-50">{uiText(isPending ? "Removing..." : "Remove This Appointment")}</button><button type="button" disabled={isPending} onClick={() => setMode("closed")} className="min-h-11 border border-border px-4 font-primary text-[10px] uppercase tracking-[0.18em] text-foreground-secondary">{ui("mdd288ae38776")}</button></div></div>
      ) : null}

      {feedback ? <p className="mt-4 font-primary text-sm text-foreground-secondary" role="status">{uiText(feedback)}</p> : null}
    </div>
  );
}
