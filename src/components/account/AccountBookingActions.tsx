"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cancelAccountBooking,
  getAccountBookingSlots,
  rescheduleAccountBooking,
} from "@/app/account/actions";
import type { CustomerManagementCapabilities } from "@/lib/booking/policy";

type DateOption = { id: string; day: string; date: string; month: string };
type Slot = { time: string; slot_start: string; slot_end: string };

export default function AccountBookingActions({
  appointmentId,
  dates,
  capabilities,
}: {
  appointmentId: string;
  dates: DateOption[];
  capabilities: CustomerManagementCapabilities;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"closed" | "reschedule" | "cancel">("closed");
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

  return (
    <div className="mt-5 border-t border-border pt-4">
      {capabilities.canReschedule || capabilities.canCancel ? <div className="grid gap-2 sm:flex sm:flex-wrap">
        {capabilities.canReschedule ? <button type="button" onClick={() => setMode("reschedule")} className="min-h-11 border border-border px-4 font-primary text-[10px] uppercase tracking-[0.18em] text-foreground-secondary transition-colors hover:text-foreground">Change Date &amp; Time</button> : null}
        {capabilities.canCancel ? <button type="button" onClick={() => setMode("cancel")} className="min-h-11 border border-border px-4 font-primary text-[10px] uppercase tracking-[0.18em] text-foreground-secondary transition-colors hover:text-foreground">Cancel Booking</button> : null}
      </div> : <div className="space-y-1 border-l border-accent pl-3 text-sm leading-6 text-foreground-secondary">{Array.from(new Set([capabilities.rescheduleBlockedReason, capabilities.cancellationBlockedReason].filter(Boolean))).map((reason) => <p key={reason}>{reason}</p>)}</div>}
      {capabilities.canReschedule || capabilities.canCancel ? <div className="mt-3 space-y-1 text-sm leading-6 text-foreground-secondary">{!capabilities.canReschedule && capabilities.rescheduleBlockedReason ? <p>{capabilities.rescheduleBlockedReason}</p> : null}{!capabilities.canCancel && capabilities.cancellationBlockedReason ? <p>{capabilities.cancellationBlockedReason}</p> : null}</div> : null}

      {mode === "reschedule" ? (
        <div className="mt-4 space-y-5 border border-border bg-background p-4 sm:p-5">
          <div><p className="font-primary text-[10px] uppercase tracking-[0.2em] text-foreground-muted">Choose New Date</p><div className="mt-3 flex gap-2 overflow-x-auto pb-2">{dates.map((date) => <button key={date.id} type="button" disabled={isPending} onClick={() => chooseDate(date.id)} className={`min-w-16 border px-2 py-3 text-center ${selectedDate === date.id ? "border-accent bg-accent text-background" : "border-border text-foreground"}`}><span className="block font-primary text-[8px] uppercase tracking-[0.16em]">{date.day}</span><span className="mt-1 block font-display text-xl">{date.date}</span><span className="block font-primary text-[8px] uppercase tracking-[0.16em]">{date.month}</span></button>)}</div></div>
          {slots.length ? <div><p className="font-primary text-[10px] uppercase tracking-[0.2em] text-foreground-muted">Available Time</p><div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">{slots.map((slot) => <button key={slot.slot_start} type="button" onClick={() => setSelectedTime(slot.time)} className={`min-h-10 border font-primary text-xs ${selectedTime === slot.time ? "border-accent bg-accent text-background" : "border-border text-foreground"}`}>{slot.time}</button>)}</div></div> : null}
          <div className="flex flex-col gap-2 sm:flex-row"><button type="button" disabled={isPending || !selectedDate || !selectedTime} onClick={reschedule} className="min-h-11 bg-accent px-4 font-primary text-[10px] uppercase tracking-[0.18em] text-background disabled:opacity-40">{isPending ? "Updating..." : "Confirm New Time"}</button><button type="button" disabled={isPending} onClick={() => setMode("closed")} className="min-h-11 border border-border px-4 font-primary text-[10px] uppercase tracking-[0.18em] text-foreground-secondary">Close</button></div>
        </div>
      ) : null}

      {mode === "cancel" ? (
        <div className="mt-4 border border-border bg-background p-4 sm:p-5"><p className="font-display text-xl uppercase text-foreground">Cancel this booking?</p><p className="mt-2 font-primary text-sm leading-6 text-foreground-secondary">The appointment time will be released. This cannot be undone here.</p><div className="mt-4 flex flex-col gap-2 sm:flex-row"><button type="button" disabled={isPending} onClick={cancel} className="min-h-11 bg-accent px-4 font-primary text-[10px] uppercase tracking-[0.18em] text-background disabled:opacity-50">{isPending ? "Cancelling..." : "Confirm Cancellation"}</button><button type="button" disabled={isPending} onClick={() => setMode("closed")} className="min-h-11 border border-border px-4 font-primary text-[10px] uppercase tracking-[0.18em] text-foreground-secondary">Keep Booking</button></div></div>
      ) : null}

      {feedback ? <p className="mt-4 font-primary text-sm text-foreground-secondary" role="status">{feedback}</p> : null}
    </div>
  );
}
