"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelManagedBooking, getManagedBookingSlots, rescheduleManagedBooking } from "@/app/booking/manage/[token]/actions";

type DateOption = { id: string; day: string; date: string; month: string };
type Slot = { time: string; slot_start: string; slot_end: string };

export default function BookingManagementView({
  token,
  booking,
  dates,
}: {
  token: string;
  booking: {
    reference: string;
    service: string;
    date: string;
    time: string;
    status: string;
    canReschedule: boolean;
    canCancel: boolean;
    rescheduleBlockedReason: string | null;
    cancellationBlockedReason: string | null;
  };
  dates: DateOption[];
}) {
  const router = useRouter();
  const [displayBooking, setDisplayBooking] = useState(booking);
  const [mode, setMode] = useState<"summary" | "reschedule" | "cancel">("summary");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [feedback, setFeedback] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setDisplayBooking(booking);
  }, [booking]);

  function chooseDate(dateKey: string) {
    setSelectedDate(dateKey);
    setSelectedTime("");
    setFeedback("");
    startTransition(async () => {
      const result = await getManagedBookingSlots(token, dateKey);
      setSlots(result.slots);
      if (result.error) setFeedback(result.error);
      else if (!result.slots.length) setFeedback("No available times on this date.");
    });
  }

  function reschedule() {
    if (!selectedDate || !selectedTime) return;
    setFeedback("");
    startTransition(async () => {
      const result = await rescheduleManagedBooking(token, selectedDate, selectedTime);
      if (result.error || !result.updatedAppointment) {
        setFeedback(result.error ?? "Unable to change this booking right now.");
        return;
      }
      setDisplayBooking((current) => ({
        ...current,
        date: result.updatedAppointment.date,
        time: result.updatedAppointment.time,
        status: result.updatedAppointment.status.replace("_", " "),
      }));
      setFeedback(result.emailWarning ?? "Your booking has been updated.");
      setMode("summary");
      router.refresh();
    });
  }

  function cancel() {
    setFeedback("");
    startTransition(async () => {
      const result = await cancelManagedBooking(token);
      if (result.error) {
        setFeedback(result.error);
        return;
      }
      setFeedback(result.emailWarning ?? "Your booking has been cancelled.");
      setMode("summary");
      router.refresh();
    });
  }

  return (
    <div className="mx-auto w-full max-w-4xl border border-border bg-surface">
      <div className="border-b border-border px-5 py-6 sm:px-8 sm:py-8">
        <p className="font-primary text-[10px] uppercase tracking-[0.32em] text-accent">Manage Booking</p>
        <div className="mt-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <h1 className="font-display text-4xl font-semibold uppercase leading-none tracking-[-0.04em] text-foreground sm:text-6xl">{displayBooking.reference}</h1>
          <span className="w-fit border border-border px-3 py-2 font-primary text-[10px] uppercase tracking-[0.2em] text-foreground-secondary">{displayBooking.status}</span>
        </div>
      </div>

      <div className="grid gap-px bg-border sm:grid-cols-3">
        {[{ label: "Service", value: displayBooking.service }, { label: "Date", value: displayBooking.date }, { label: "Time", value: displayBooking.time }].map((item) => (
          <div key={item.label} className="bg-background px-5 py-6 sm:px-7">
            <p className="font-primary text-[9px] uppercase tracking-[0.25em] text-foreground-muted">{item.label}</p>
            <p className="mt-3 font-primary text-sm text-foreground">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="px-5 py-7 sm:px-8 sm:py-9">
        {!displayBooking.canReschedule && !displayBooking.canCancel ? (
          <div className="space-y-2 border-l border-accent pl-4 font-primary text-sm leading-7 text-foreground-secondary">{Array.from(new Set([displayBooking.rescheduleBlockedReason, displayBooking.cancellationBlockedReason].filter(Boolean))).map((reason) => <p key={reason}>{reason}</p>)}</div>
        ) : mode === "summary" ? (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row">{displayBooking.canReschedule ? <button type="button" onClick={() => setMode("reschedule")} className="min-h-12 flex-1 border border-accent bg-accent px-5 font-primary text-xs uppercase tracking-[0.2em] text-background transition-colors hover:bg-accent-hover">Change Date &amp; Time →</button> : null}{displayBooking.canCancel ? <button type="button" onClick={() => setMode("cancel")} className="min-h-12 flex-1 border border-border px-5 font-primary text-xs uppercase tracking-[0.2em] text-foreground-secondary transition-colors hover:border-foreground-muted hover:text-foreground">Cancel Booking</button> : null}</div>
            {!displayBooking.canReschedule && displayBooking.rescheduleBlockedReason ? <p className="text-sm leading-6 text-foreground-secondary">{displayBooking.rescheduleBlockedReason}</p> : null}
            {!displayBooking.canCancel && displayBooking.cancellationBlockedReason ? <p className="text-sm leading-6 text-foreground-secondary">{displayBooking.cancellationBlockedReason}</p> : null}
          </div>
        ) : mode === "cancel" ? (
          <div className="space-y-5">
            <div><p className="font-display text-2xl uppercase text-foreground">Cancel this booking?</p><p className="mt-2 font-primary text-sm leading-7 text-foreground-secondary">This action releases your appointment time and cannot be undone from this page.</p></div>
            <div className="flex flex-col gap-3 sm:flex-row"><button type="button" disabled={isPending} onClick={cancel} className="min-h-12 border border-accent bg-accent px-6 font-primary text-xs uppercase tracking-[0.18em] text-background disabled:opacity-50">{isPending ? "Cancelling..." : "Confirm Cancellation"}</button><button type="button" disabled={isPending} onClick={() => setMode("summary")} className="min-h-12 border border-border px-6 font-primary text-xs uppercase tracking-[0.18em] text-foreground-secondary">Keep Booking</button></div>
          </div>
        ) : (
          <div className="space-y-7">
            <div><p className="font-display text-2xl uppercase text-foreground">Choose a new date</p><p className="mt-2 font-primary text-sm text-foreground-secondary">Available times account for your current booking.</p></div>
            <div className="flex gap-2 overflow-x-auto pb-2">{dates.map((date) => <button key={date.id} type="button" disabled={isPending} onClick={() => chooseDate(date.id)} className={`min-w-20 border px-3 py-4 text-center transition-colors ${selectedDate === date.id ? "border-accent bg-accent text-background" : "border-border bg-background text-foreground"}`}><span className="block font-primary text-[9px] uppercase tracking-[0.18em]">{date.day}</span><span className="mt-2 block font-display text-2xl">{date.date}</span><span className="block font-primary text-[9px] uppercase tracking-[0.18em]">{date.month}</span></button>)}</div>
            {slots.length ? <div><p className="mb-3 font-primary text-[10px] uppercase tracking-[0.22em] text-foreground-muted">Available Time</p><div className="grid grid-cols-3 gap-2 sm:grid-cols-5">{slots.map((slot) => <button key={slot.slot_start} type="button" onClick={() => setSelectedTime(slot.time)} className={`min-h-11 border font-primary text-xs ${selectedTime === slot.time ? "border-accent bg-accent text-background" : "border-border text-foreground"}`}>{slot.time}</button>)}</div></div> : null}
            <div className="flex flex-col gap-3 sm:flex-row"><button type="button" disabled={isPending || !selectedDate || !selectedTime} onClick={reschedule} className="min-h-12 border border-accent bg-accent px-6 font-primary text-xs uppercase tracking-[0.18em] text-background disabled:opacity-40">{isPending ? "Updating..." : "Confirm New Time"}</button><button type="button" disabled={isPending} onClick={() => setMode("summary")} className="min-h-12 border border-border px-6 font-primary text-xs uppercase tracking-[0.18em] text-foreground-secondary">Back</button></div>
          </div>
        )}
        {feedback ? <p className="mt-5 border-t border-border pt-5 font-primary text-sm text-foreground-secondary" role="status">{feedback}</p> : null}
      </div>
    </div>
  );
}
