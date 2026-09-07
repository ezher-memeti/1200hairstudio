"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  closeAvailabilityDateRange,
  openAvailabilityDateRange,
  saveAvailabilityException,
} from "@/app/admin/(dashboard)/calendar/actions";
import Link from "next/link";
import AdminSelect from "@/components/admin/AdminSelect";
import {
  addMonthsToDateKey,
  formatDateKey,
  getMonthGridDateKeys,
  getMonthStartDateKey,
  getTodayDateKeyInZurich,
  getWeekdayNumberFromDateKey,
  parseDateKeyToUtcDate,
} from "@/lib/appointments/date-utils";
import type { AvailabilityExceptionRecord } from "@/lib/availability-exceptions/types";
import type { BusinessHourRecord } from "@/lib/business-hours/types";
import type { AdminAppointmentSummary } from "@/lib/appointments/types";
import type { FinanceTransaction } from "@/lib/finance/types";
import type { ServiceRecord } from "@/lib/services/types";
import {
  formatBusinessHourRange,
  formatBusinessHourTime,
  getBusinessHourDayLabel,
} from "@/lib/public/business-hours-utils";
import DateTimePicker from "@/components/admin/ui/DateTimePicker";

type AdminAvailabilityCalendarProps = {
  initialBusinessHours: BusinessHourRecord[];
  initialExceptions: AvailabilityExceptionRecord[];
  appointments: AdminAppointmentSummary[];
  transactions: FinanceTransaction[];
  services: ServiceRecord[];
  loadError?: string | null;
};

type ExceptionMode = "normal" | "closed" | "custom";

type EditorState = {
  mode: ExceptionMode;
  openTime: string;
  closeTime: string;
  reason: string;
};

type RangeEditorState = {
  startDate: string;
  endDate: string;
  reason: string;
};

type RangeAction = "close" | "open";

const dayHeaders = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function getDateKey(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createDateAtNoon(year: number, monthIndex: number, day: number) {
  return new Date(Date.UTC(year, monthIndex, day, 12, 0, 0, 0));
}

function getStartOfMonth(date: Date) {
  return createDateAtNoon(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

function formatLongDate(date: Date) {
  return formatDateKey(getDateKey(date), {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatShortException(exception: AvailabilityExceptionRecord) {
  if (exception.is_closed) {
    return "Closed";
  }

  const open = formatBusinessHourTime(exception.open_time);
  const close = formatBusinessHourTime(exception.close_time);

  if (!open || !close) {
    return "Custom hours";
  }

  return `${open}–${close}`;
}

function toEditorState(
  exception: AvailabilityExceptionRecord | null,
  fallbackHour: BusinessHourRecord | undefined,
): EditorState {
  if (!exception) {
    return {
      mode: "normal",
      openTime: fallbackHour?.open_time ?? "09:00",
      closeTime: fallbackHour?.close_time ?? "18:00",
      reason: "",
    };
  }

  if (exception.is_closed) {
    return {
      mode: "closed",
      openTime: fallbackHour?.open_time ?? "09:00",
      closeTime: fallbackHour?.close_time ?? "18:00",
      reason: exception.reason ?? "",
    };
  }

  return {
    mode: "custom",
    openTime: exception.open_time ?? fallbackHour?.open_time ?? "09:00",
    closeTime: exception.close_time ?? fallbackHour?.close_time ?? "18:00",
    reason: exception.reason ?? "",
  };
}

export default function AdminAvailabilityCalendar({
  initialBusinessHours,
  initialExceptions,
  appointments,
  transactions,
  services,
  loadError,
}: AdminAvailabilityCalendarProps) {
  const todayDateKey = useMemo(() => getTodayDateKeyInZurich(), []);
  const today = useMemo(() => parseDateKeyToUtcDate(todayDateKey) ?? new Date(), [todayDateKey]);
  const businessHours = useMemo(
    () =>
      initialBusinessHours
        .slice()
        .sort((first, second) => first.day_of_week - second.day_of_week),
    [initialBusinessHours],
  );
  const [exceptions, setExceptions] = useState(initialExceptions);
  const [visibleMonthKey, setVisibleMonthKey] = useState(getMonthStartDateKey(todayDateKey));
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [isRangeEditorOpen, setIsRangeEditorOpen] = useState(false);
  const [rangeAction, setRangeAction] = useState<RangeAction>("close");
  const [openMode, setOpenMode] = useState<"closed_only" | "all_exceptions">("closed_only");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editorState, setEditorState] = useState<EditorState>({
    mode: "normal",
    openTime: "09:00",
    closeTime: "18:00",
    reason: "",
  });
  const [rangeEditorState, setRangeEditorState] = useState<RangeEditorState>({
    startDate: todayDateKey,
    endDate: todayDateKey,
    reason: "",
  });
  const [feedback, setFeedback] = useState("");
  const [rangeFeedback, setRangeFeedback] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [rangeSaveState, setRangeSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [isPending, startTransition] = useTransition();
  const [isRangePending, startRangeTransition] = useTransition();

  useEffect(() => {
    if (!selectedDateKey && !isRangeEditorOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isRangeEditorOpen, selectedDateKey]);

  useEffect(() => {
    if (saveState !== "saved") {
      return;
    }

    const timeout = window.setTimeout(() => {
      setSaveState("idle");
    }, 1800);

    return () => window.clearTimeout(timeout);
  }, [saveState]);

  useEffect(() => {
    if (rangeSaveState !== "saved") {
      return;
    }

    const timeout = window.setTimeout(() => {
      setRangeSaveState("idle");
    }, 1800);

    return () => window.clearTimeout(timeout);
  }, [rangeSaveState]);

  const exceptionsByDate = useMemo(
    () => new Map(exceptions.map((exception) => [exception.date, exception])),
    [exceptions],
  );

  const dayMetrics = useMemo(() => {
    const filteredAppointments = appointments.filter((appointment) =>
      appointment.status !== "cancelled" &&
      (serviceFilter === "all" || appointment.service_id === serviceFilter) &&
      (statusFilter === "all" || appointment.status === statusFilter)
    );
    const appointmentsById = new Map(filteredAppointments.map((appointment) => [appointment.id, appointment]));
    const metrics = new Map<string, { count: number; bookedMinutes: number; revenue: number }>();
    filteredAppointments.forEach((appointment) => {
      const key = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(appointment.start_at));
      const current = metrics.get(key) ?? { count: 0, bookedMinutes: 0, revenue: 0 };
      current.count += 1;
      current.bookedMinutes += Math.max(0, (new Date(appointment.end_at).getTime() - new Date(appointment.start_at).getTime()) / 60000);
      metrics.set(key, current);
    });
    transactions.filter((transaction) => transaction.status === "completed" && appointmentsById.has(transaction.appointment_id)).forEach((transaction) => {
      const appointment = appointmentsById.get(transaction.appointment_id)!;
      const key = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(appointment.start_at));
      const current = metrics.get(key) ?? { count: 0, bookedMinutes: 0, revenue: 0 };
      current.revenue += transaction.transaction_type === "payment" ? transaction.amount : -transaction.amount;
      metrics.set(key, current);
    });
    return metrics;
  }, [appointments, serviceFilter, statusFilter, transactions]);

  const selectedDate = selectedDateKey ? parseDateKeyToUtcDate(selectedDateKey) : null;
  const selectedWeekday = selectedDateKey ? getWeekdayNumberFromDateKey(selectedDateKey) : null;
  const normalHours =
    selectedWeekday === null
      ? undefined
      : businessHours.find((hour) => hour.day_of_week === selectedWeekday);
  const selectedException =
    selectedDateKey ? exceptionsByDate.get(selectedDateKey) ?? null : null;
  const selectedMetrics = selectedDateKey ? dayMetrics.get(selectedDateKey) ?? { count: 0, bookedMinutes: 0, revenue: 0 } : null;
  const selectedIsClosed = selectedException ? selectedException.is_closed : normalHours?.is_closed ?? true;
  const selectedOpenTime = selectedException && !selectedException.is_closed ? selectedException.open_time : normalHours?.open_time;
  const selectedCloseTime = selectedException && !selectedException.is_closed ? selectedException.close_time : normalHours?.close_time;
  const selectedAvailableMinutes = !selectedIsClosed && selectedOpenTime && selectedCloseTime ? Math.max(0, minutesFromTime(selectedCloseTime) - minutesFromTime(selectedOpenTime)) : 0;
  const selectedOccupancy = selectedMetrics && selectedAvailableMinutes ? Math.min(100, Math.round(selectedMetrics.bookedMinutes / selectedAvailableMinutes * 100)) : 0;

  useEffect(() => {
    if (!selectedDateKey) {
      return;
    }

    setEditorState(toEditorState(selectedException, normalHours));
    setFeedback("");
    setSaveState("idle");
  }, [normalHours, selectedDateKey, selectedException]);

  const calendarDays = useMemo(() => {
    const monthPrefix = visibleMonthKey.slice(0, 7);

    return getMonthGridDateKeys(visibleMonthKey).map((dateKey) => {
      const date = parseDateKeyToUtcDate(dateKey) ?? today;

      return {
        date,
        key: dateKey,
        isCurrentMonth: dateKey.slice(0, 7) === monthPrefix,
        isToday: dateKey === todayDateKey,
      };
    });
  }, [today, todayDateKey, visibleMonthKey]);

  function openDateEditor(dateKey: string) {
    setSelectedDateKey(dateKey);
  }

  function closeEditor() {
    setSelectedDateKey(null);
    setFeedback("");
    setSaveState("idle");
  }

  function openRangeEditor(action: RangeAction) {
    setRangeAction(action);
    setIsRangeEditorOpen(true);
    setRangeEditorState({
      startDate: selectedDateKey ?? todayDateKey,
      endDate: selectedDateKey ?? todayDateKey,
      reason: "",
    });
    setRangeFeedback("");
    setRangeSaveState("idle");
  }

  function closeRangeEditor() {
    setIsRangeEditorOpen(false);
    setRangeFeedback("");
    setRangeSaveState("idle");
  }

  function handleSave() {
    if (!selectedDateKey) {
      return;
    }

    setFeedback("");
    setSaveState("saving");

    startTransition(async () => {
      const result = await saveAvailabilityException({
        date: selectedDateKey,
        mode: editorState.mode,
        open_time:
          editorState.mode === "custom" ? editorState.openTime : null,
        close_time:
          editorState.mode === "custom" ? editorState.closeTime : null,
        reason: editorState.reason,
      });

      if (result.error) {
        setFeedback(result.error);
        setSaveState("idle");
        return;
      }

      setExceptions((current) => {
        if (editorState.mode === "normal") {
          return current.filter((item) => item.date !== selectedDateKey);
        }

        if (!result.exception) {
          return current;
        }

        const next = current.filter((item) => item.date !== selectedDateKey);
        next.push(result.exception);
        next.sort((first, second) => first.date.localeCompare(second.date));
        return next;
      });

      setSaveState("saved");
    });
  }

  const rangeStartDate = rangeEditorState.startDate
    ? parseDateFromKey(rangeEditorState.startDate)
    : null;
  const rangeEndDate = rangeEditorState.endDate
    ? parseDateFromKey(rangeEditorState.endDate)
    : null;
  const rangeDayCount =
    rangeStartDate && rangeEndDate && rangeEndDate >= rangeStartDate
      ? Math.floor(
          (rangeEndDate.getTime() - rangeStartDate.getTime()) /
            (1000 * 60 * 60 * 24),
        ) + 1
      : 0;

  function handleSaveRange() {
    setRangeFeedback("");
    setRangeSaveState("saving");

    startRangeTransition(async () => {
      if (rangeAction === "open") {
        const result = await openAvailabilityDateRange({ start_date: rangeEditorState.startDate, end_date: rangeEditorState.endDate, mode: openMode });
        if (result.error) { setRangeFeedback(result.error); setRangeSaveState("idle"); return; }
        setExceptions((current) => current.filter((item) => !result.removedDates.includes(item.date)));
        setRangeSaveState("saved");
        closeRangeEditor();
        return;
      }
      const result = await closeAvailabilityDateRange({
        start_date: rangeEditorState.startDate,
        end_date: rangeEditorState.endDate,
        reason: rangeEditorState.reason,
      });

      if (result.error) {
        setRangeFeedback(result.error);
        setRangeSaveState("idle");
        return;
      }

      setExceptions((current) => {
        const next = current.filter(
          (item) =>
            !result.exceptions.some(
              (updatedException) => updatedException.date === item.date,
            ),
        );
        next.push(...result.exceptions);
        next.sort((first, second) => first.date.localeCompare(second.date));
        return next;
      });

      setRangeSaveState("saved");
      closeRangeEditor();
    });
  }

  return (
    <section className="min-w-0 space-y-6 sm:space-y-8">
      <div className="space-y-4">
        <p className="font-primary text-xs uppercase tracking-[0.34em] text-foreground-secondary">
          Calendar
        </p>
        <div className="space-y-2">
          <h1 className="font-display text-[clamp(2.2rem,5vw,4.25rem)] font-semibold uppercase leading-[0.95] tracking-[-0.04em] text-foreground">
            Availability Exceptions
          </h1>
          <p className="max-w-2xl font-primary text-sm leading-7 text-foreground-secondary sm:text-base">
            Override weekly business hours for specific dates without changing the recurring schedule.
          </p>
        </div>
      </div>

      {loadError ? (
        <div className="border border-border bg-surface px-5 py-5">
          <p className="font-primary text-sm leading-7 text-foreground-secondary">
            {loadError}
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-4 border border-border bg-surface px-3 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid grid-cols-2 gap-2 min-[430px]:flex min-[430px]:flex-wrap min-[430px]:items-center sm:gap-3">
          <button
            type="button"
            onClick={() => setVisibleMonthKey((current) => addMonthsToDateKey(current, -1))}
            className="inline-flex min-h-11 items-center justify-center border border-border px-4 py-2 font-primary text-xs uppercase tracking-[0.18em] text-foreground-secondary transition-colors hover:bg-background hover:text-foreground"
          >
            ← Prev
          </button>
          <h2 className="col-span-2 row-start-1 text-center font-display text-2xl uppercase tracking-[-0.04em] text-foreground min-[430px]:order-first min-[430px]:col-auto min-[430px]:text-left sm:text-3xl">
            {formatDateKey(visibleMonthKey, { month: "long", year: "numeric" })}
          </h2>
          <button
            type="button"
            onClick={() => setVisibleMonthKey((current) => addMonthsToDateKey(current, 1))}
            className="inline-flex min-h-11 items-center justify-center border border-border px-4 py-2 font-primary text-xs uppercase tracking-[0.18em] text-foreground-secondary transition-colors hover:bg-background hover:text-foreground"
          >
            Next →
          </button>
          <button
            type="button"
            onClick={() => {
              setVisibleMonthKey(getMonthStartDateKey(todayDateKey));
              setSelectedDateKey(null);
            }}
            className="inline-flex min-h-11 items-center justify-center border border-border px-4 py-2 font-primary text-xs uppercase tracking-[0.18em] text-foreground-secondary transition-colors hover:bg-background hover:text-foreground"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => openRangeEditor("close")}
            className="inline-flex min-h-11 items-center justify-center border border-border px-4 py-2 font-primary text-xs uppercase tracking-[0.18em] text-foreground-secondary transition-colors hover:bg-background hover:text-foreground"
          >
            Close Date Range
          </button>
          <button
            type="button"
            onClick={() => openRangeEditor("open")}
            className="inline-flex min-h-11 items-center justify-center border border-accent/50 px-4 py-2 font-primary text-xs uppercase tracking-[0.18em] text-accent transition-colors hover:bg-accent/10"
          >
            Open Date Range
          </button>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="inline-flex items-center gap-2 font-primary text-[11px] uppercase tracking-[0.22em] text-foreground-secondary">
            <span className="h-2.5 w-2.5 bg-error" />
            Closed
          </div>
          <div className="inline-flex items-center gap-2 font-primary text-[11px] uppercase tracking-[0.22em] text-foreground-secondary">
            <span className="h-2.5 w-2.5 bg-accent" />
            Custom Hours
          </div>
        </div>
      </div>

      <div className="grid gap-4 border border-border bg-surface p-4 sm:grid-cols-2 lg:max-w-2xl">
        <AdminSelect label="Service" value={serviceFilter} onChange={setServiceFilter} options={[{ value: "all", label: "All Services" }, ...services.map((service) => ({ value: service.id, label: service.name }))]} />
        <AdminSelect label="Status" value={statusFilter} onChange={setStatusFilter} options={[{ value: "all", label: "All Active Statuses" }, { value: "confirmed", label: "Confirmed" }, { value: "completed", label: "Completed" }, { value: "no_show", label: "No Show" }]} />
      </div>

      <div className="border border-border bg-surface">
        <div className="grid grid-cols-7 border-b border-border">
          {dayHeaders.map((label) => (
            <div
              key={label}
              className="px-2 py-3 text-center font-primary text-[10px] uppercase tracking-[0.24em] text-foreground-muted sm:px-3 sm:text-[11px]"
            >
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {calendarDays.map((day) => {
            const exception = exceptionsByDate.get(day.key);
            const isSelected = selectedDateKey === day.key;
            const metrics = dayMetrics.get(day.key) ?? { count: 0, bookedMinutes: 0, revenue: 0 };
            const weekday = getWeekdayNumberFromDateKey(day.key);
            const recurringHours = businessHours.find((hour) => hour.day_of_week === weekday);
            const isClosed = exception ? exception.is_closed : recurringHours?.is_closed ?? true;
            const openTime = exception && !exception.is_closed ? exception.open_time : recurringHours?.open_time;
            const closeTime = exception && !exception.is_closed ? exception.close_time : recurringHours?.close_time;
            const availableMinutes = !isClosed && openTime && closeTime ? Math.max(0, minutesFromTime(closeTime) - minutesFromTime(openTime)) : 0;
            const occupancy = availableMinutes ? Math.min(100, Math.round(metrics.bookedMinutes / availableMinutes * 100)) : 0;

            return (
              <button
                key={day.key}
                type="button"
                onClick={() => openDateEditor(day.key)}
                className={`group flex min-h-[5.25rem] flex-col justify-between overflow-hidden border-b border-r border-border px-1.5 py-2 text-left transition-colors sm:min-h-[10rem] sm:px-3 sm:py-3 ${
                  day.isCurrentMonth
                    ? "bg-background text-foreground hover:bg-background-secondary"
                    : "bg-background/40 text-foreground-muted hover:bg-background/70"
                } ${isSelected ? "bg-background-secondary" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span
                    className={`font-display text-xl uppercase leading-none tracking-[-0.04em] sm:text-2xl ${
                      day.isToday ? "text-accent" : ""
                    }`}
                  >
                    {formatDateKey(day.key, { day: "numeric" })}
                  </span>
                  {day.isToday ? (
                    <span className="hidden font-primary text-[9px] uppercase tracking-[0.22em] text-accent sm:inline sm:text-[10px]">
                      Today
                    </span>
                  ) : null}
                </div>

                <div className="space-y-1 sm:space-y-1.5">
                  <span className={`block h-1 w-full sm:hidden ${isClosed ? "bg-error/60" : exception ? "bg-accent" : metrics.count ? "bg-accent/70" : "bg-border"}`} aria-hidden="true" />
                  <div className="hidden space-y-1.5 sm:block">
                  {metrics.count ? <p className="font-primary text-[10px] uppercase tracking-[0.13em] text-foreground sm:text-[11px]">{metrics.count} appointment{metrics.count === 1 ? "" : "s"}</p> : <p className="font-primary text-[9px] uppercase tracking-[0.13em] text-foreground-muted">No appointments</p>}
                  {metrics.revenue ? <p className="font-primary text-[10px] text-foreground-secondary">CHF {metrics.revenue.toFixed(2)}</p> : null}
                  {!isClosed && availableMinutes ? <p className="font-primary text-[9px] uppercase tracking-[0.13em] text-foreground-muted">{occupancy}% booked</p> : null}
                  {exception ? (
                    <>
                      <span
                        className={`inline-flex h-1.5 w-full ${
                          exception.is_closed ? "bg-error" : "bg-accent"
                        }`}
                        aria-hidden="true"
                      />
                      <p className="font-primary text-[9px] uppercase tracking-[0.18em] text-foreground-secondary sm:text-[10px]">
                        {exception.is_closed ? "Closed" : `Custom · ${openTime?.slice(0,5)}–${closeTime?.slice(0,5)}`}
                      </p>
                      {exception.is_closed && metrics.count ? <p className="font-primary text-[9px] uppercase tracking-[0.13em] text-error">Needs attention</p> : null}
                    </>
                  ) : (
                    <p className="font-primary text-[9px] uppercase tracking-[0.18em] text-foreground-muted sm:text-[10px]">
                      {isClosed ? "Closed" : "Normal hours"}
                    </p>
                  )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selectedDateKey && selectedDate ? (
        <div className="fixed inset-0 z-50 flex items-end bg-background/70 sm:items-center sm:justify-center">
          <button
            type="button"
            aria-label="Close availability editor"
            onClick={closeEditor}
            className="absolute inset-0 cursor-default"
          />

          <div className="admin-scrollbar relative z-10 max-h-[calc(100dvh-16px)] w-full overflow-y-auto overscroll-contain border border-border bg-background-secondary px-4 py-5 pb-[max(20px,env(safe-area-inset-bottom))] sm:m-6 sm:max-h-[calc(100dvh-48px)] sm:max-w-2xl sm:px-6 sm:py-6">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <p className="font-primary text-xs uppercase tracking-[0.3em] text-foreground-secondary">
                  {selectedWeekday ? getBusinessHourDayLabel(selectedWeekday) : "Date"}
                </p>
                <h3 className="font-display text-3xl uppercase tracking-[-0.04em] text-foreground sm:text-4xl">
                  {formatLongDate(selectedDate)}
                </h3>
                <p className="font-primary text-sm uppercase tracking-[0.18em] text-foreground-muted">
                  Normal hours: {normalHours ? formatBusinessHourRange(normalHours) : "Unavailable"}
                </p>
              </div>

              <button
                type="button"
                onClick={closeEditor}
                className="inline-flex min-h-11 min-w-11 items-center justify-center border border-border px-3 py-2 font-primary text-xs uppercase tracking-[0.18em] text-foreground-secondary transition-colors hover:bg-surface hover:text-foreground"
              >
                Close
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="border border-border bg-surface p-4"><p className="text-[10px] uppercase tracking-[0.16em] text-foreground-muted">Appointments</p><p className="mt-2 text-xl text-foreground">{selectedMetrics?.count ?? 0}</p></div>
                <div className="border border-border bg-surface p-4"><p className="text-[10px] uppercase tracking-[0.16em] text-foreground-muted">Revenue</p><p className="mt-2 text-xl text-foreground">CHF {(selectedMetrics?.revenue ?? 0).toFixed(2)}</p></div>
                <div className="border border-border bg-surface p-4"><p className="text-[10px] uppercase tracking-[0.16em] text-foreground-muted">Availability</p><p className="mt-2 text-xl text-foreground">{selectedIsClosed ? "Closed" : `${selectedOccupancy}% booked`}</p></div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={`/admin/appointments?view=day&date=${selectedDateKey}`} className="inline-flex min-h-11 items-center justify-center bg-accent px-4 text-xs uppercase tracking-[0.16em] text-background">View Appointments</Link>
                <button type="button" onClick={() => setEditorState((current) => ({ ...current, mode: selectedIsClosed ? "normal" : current.mode }))} className="inline-flex min-h-11 items-center justify-center border border-border px-4 text-xs uppercase tracking-[0.16em] text-foreground-secondary">{selectedIsClosed ? "Open Day" : "Change Hours"}</button>
                {!selectedIsClosed ? <button type="button" onClick={() => setEditorState((current) => ({ ...current, mode: "closed" }))} className="inline-flex min-h-11 items-center justify-center border border-error/50 px-4 text-xs uppercase tracking-[0.16em] text-error">Close Day</button> : null}
              </div>
              {[
                {
                  value: "normal" as const,
                  label: "Use normal hours",
                  detail: "No date-specific override",
                },
                {
                  value: "closed" as const,
                  label: "Close entire day",
                  detail: "Hide all availability for this date",
                },
                {
                  value: "custom" as const,
                  label: "Set custom hours",
                  detail: "Choose a different opening window",
                },
              ].map((option) => (
                <label
                  key={option.value}
                  className={`flex cursor-pointer items-start gap-3 border px-4 py-4 transition-colors ${
                    editorState.mode === option.value
                      ? "border-accent bg-background"
                      : "border-border bg-surface hover:bg-background"
                  }`}
                >
                  <input
                    type="radio"
                    name="availability-mode"
                    value={option.value}
                    checked={editorState.mode === option.value}
                    onChange={() =>
                      setEditorState((current) => ({
                        ...current,
                        mode: option.value,
                        openTime:
                          current.openTime || normalHours?.open_time || "09:00",
                        closeTime:
                          current.closeTime || normalHours?.close_time || "18:00",
                      }))
                    }
                    className="mt-1 h-4 w-4 accent-[var(--accent)]"
                  />
                  <span className="space-y-1">
                    <span className="block font-primary text-sm uppercase tracking-[0.18em] text-foreground">
                      {option.label}
                    </span>
                    <span className="block font-primary text-sm leading-6 text-foreground-secondary">
                      {option.detail}
                    </span>
                  </span>
                </label>
              ))}
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <DateTimePicker mode="time" minuteStep={5} label="Opening" value={editorState.openTime} disabled={editorState.mode !== "custom"} onChange={(nextTime) => setEditorState((current) => ({ ...current, openTime: nextTime }))} />

              <DateTimePicker mode="time" minuteStep={5} label="Closing" value={editorState.closeTime} disabled={editorState.mode !== "custom"} onChange={(nextTime) => setEditorState((current) => ({ ...current, closeTime: nextTime }))} />
            </div>

            <label className="mt-6 block space-y-2">
              <span className="font-primary text-[11px] uppercase tracking-[0.2em] text-foreground-muted">
                Reason (optional)
              </span>
              <textarea
                value={editorState.reason}
                onChange={(event) =>
                  setEditorState((current) => ({
                    ...current,
                    reason: event.target.value,
                  }))
                }
                rows={3}
                className="w-full resize-none border border-border bg-transparent px-3 py-3 font-primary text-sm text-foreground outline-none transition-colors"
                placeholder="Reason for this exception (Optional)"
              />
            </label>

            {selectedException ? (
              <div className="mt-4 border border-border bg-surface px-4 py-4">
                <p className="font-primary text-xs uppercase tracking-[0.22em] text-foreground-secondary">
                  Existing override
                </p>
                <p className="mt-2 font-primary text-sm leading-6 text-foreground-secondary">
                  {formatShortException(selectedException)}
                  {selectedException.reason ? ` · ${selectedException.reason}` : ""}
                </p>
              </div>
            ) : null}

            {feedback ? (
              <div className="mt-4 border border-border bg-surface px-4 py-4">
                <p className="font-primary text-sm leading-6 text-foreground-secondary">
                  {feedback}
                </p>
              </div>
            ) : null}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="font-primary text-xs uppercase tracking-[0.22em] text-foreground-muted">
                {saveState === "saved" ? "Saved" : isPending ? "Saving..." : ""}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={closeEditor}
                  className="inline-flex min-h-11 items-center justify-center border border-border px-4 py-3 font-primary text-xs uppercase tracking-[0.18em] text-foreground-secondary transition-colors hover:bg-surface hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleSave}
                  className="inline-flex min-h-11 items-center justify-center border border-border bg-accent px-4 py-3 font-primary text-xs uppercase tracking-[0.18em] text-background transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface disabled:text-foreground-muted"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isRangeEditorOpen ? (
        <div className="fixed inset-0 z-50 flex items-end bg-background/70 sm:items-center sm:justify-center">
          <button
            type="button"
            aria-label="Close date range editor"
            onClick={closeRangeEditor}
            className="absolute inset-0 cursor-default"
          />

          <div className="admin-scrollbar relative z-10 max-h-[calc(100dvh-16px)] w-full overflow-y-auto overscroll-contain border border-border bg-background-secondary px-4 py-5 pb-[max(20px,env(safe-area-inset-bottom))] sm:m-6 sm:max-h-[calc(100dvh-48px)] sm:max-w-xl sm:px-6 sm:py-6">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <p className="font-primary text-xs uppercase tracking-[0.3em] text-foreground-secondary">
                  Calendar
                </p>
                <h3 className="font-display text-3xl uppercase tracking-[-0.04em] text-foreground sm:text-4xl">
                  {rangeAction === "close" ? "Close Date Range" : "Open Date Range"}
                </h3>
              </div>

              <button
                type="button"
                onClick={closeRangeEditor}
                className="inline-flex min-h-11 min-w-11 items-center justify-center border border-border px-3 py-2 font-primary text-xs uppercase tracking-[0.18em] text-foreground-secondary transition-colors hover:bg-surface hover:text-foreground"
              >
                Close
              </button>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <DateTimePicker mode="date" label="Start date" value={rangeEditorState.startDate} onChange={(nextDate) => setRangeEditorState((current) => ({ ...current, startDate: nextDate }))} />

              <DateTimePicker mode="date" label="End date" value={rangeEditorState.endDate} minDate={rangeEditorState.startDate || undefined} onChange={(nextDate) => setRangeEditorState((current) => ({ ...current, endDate: nextDate }))} />
            </div>

            {rangeAction === "open" ? <div className="mt-6"><AdminSelect label="Opening behavior" value={openMode} onChange={(value) => setOpenMode(value as "closed_only" | "all_exceptions")} options={[{ value: "closed_only", label: "Open closed dates only" }, { value: "all_exceptions", label: "Restore all to normal weekly hours" }]} /><p className="mt-2 text-xs leading-5 text-foreground-muted">The default preserves custom-hour dates. Restoring all removes every date-specific override in the range.</p></div> : null}

            {rangeAction === "close" ? <label className="mt-6 block space-y-2">
              <span className="font-primary text-[11px] uppercase tracking-[0.2em] text-foreground-muted">
                Reason (optional)
              </span>
              <textarea
                value={rangeEditorState.reason}
                onChange={(event) =>
                  setRangeEditorState((current) => ({
                    ...current,
                    reason: event.target.value,
                  }))
                }
                rows={3}
                className="w-full resize-none border border-border bg-transparent px-3 py-3 font-primary text-sm text-foreground outline-none transition-colors"
                placeholder="Reason for this closure (Optional)"
              />
            </label> : null}

            <div className="mt-6 border border-border bg-surface px-4 py-4">
              <p className="font-primary text-xs uppercase tracking-[0.22em] text-foreground-secondary">
                Summary
              </p>
              <p className="mt-2 font-primary text-sm leading-6 text-foreground-secondary">
                {rangeStartDate && rangeEndDate && rangeDayCount > 0
                  ? `${rangeAction === "close" ? "Close" : "Open"} ${formatShortRange(rangeStartDate, rangeEndDate)} (${rangeDayCount} day${rangeDayCount === 1 ? "" : "s"})?`
                  : "Select a valid date range."}
              </p>
            </div>

            {rangeFeedback ? (
              <div className="mt-4 border border-border bg-surface px-4 py-4">
                <p className="font-primary text-sm leading-6 text-foreground-secondary">
                  {rangeFeedback}
                </p>
              </div>
            ) : null}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="font-primary text-xs uppercase tracking-[0.22em] text-foreground-muted">
                {rangeSaveState === "saved"
                  ? "Saved"
                  : isRangePending
                    ? "Saving..."
                    : ""}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={closeRangeEditor}
                  className="inline-flex min-h-11 items-center justify-center border border-border px-4 py-3 font-primary text-xs uppercase tracking-[0.18em] text-foreground-secondary transition-colors hover:bg-surface hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={
                    isRangePending ||
                    !rangeEditorState.startDate ||
                    !rangeEditorState.endDate ||
                    rangeDayCount < 1
                  }
                  onClick={handleSaveRange}
                  className="inline-flex min-h-11 items-center justify-center border border-border bg-accent px-4 py-3 font-primary text-xs uppercase tracking-[0.18em] text-background transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface disabled:text-foreground-muted"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function parseDateFromKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);

  if (!year || !month || !day) {
    return null;
  }

  return createDateAtNoon(year, month - 1, day);
}

function minutesFromTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function formatShortRange(startDate: Date, endDate: Date) {
  const startDay = startDate.getDate();
  const endDay = endDate.getDate();
  const startMonth = monthNames[startDate.getMonth()].slice(0, 3);
  const endMonth = monthNames[endDate.getMonth()].slice(0, 3);

  if (
    startDate.getFullYear() === endDate.getFullYear() &&
    startDate.getMonth() === endDate.getMonth()
  ) {
    return `${startDay} ${startMonth} – ${endDay} ${endMonth}`;
  }

  return `${startDay} ${startMonth} – ${endDay} ${endMonth}`;
}
