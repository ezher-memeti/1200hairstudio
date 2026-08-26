"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { updateAdminAppointment } from "@/app/actions/appointments";
import { formatZurichTime } from "@/lib/appointments/availability";
import type { AdminAppointmentDetail, AppointmentStatus } from "@/lib/appointments/types";
import type { AvailabilityExceptionRecord } from "@/lib/availability-exceptions/types";
import type { BusinessHourRecord } from "@/lib/business-hours/types";
import { getEffectiveHours, toDateKey } from "@/lib/public/booking-availability-utils";

type ViewMode = "week" | "day" | "list";

type Props = {
  view: ViewMode;
  selectedDate: string;
  appointments: AdminAppointmentDetail[];
  businessHours: BusinessHourRecord[];
  exceptions: AvailabilityExceptionRecord[];
  todayDateKey: string;
};

type AppointmentCard = AdminAppointmentDetail & {
  dateKey: string;
  startMinutes: number;
  endMinutes: number;
  lane: number;
  laneCount: number;
};

const SLOT_MINUTES = 30;
const WEEKDAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No Show",
};

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function addDays(dateKey: string, days: number) {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

function getWeekStart(dateKey: string) {
  const date = parseDateKey(dateKey);
  const jsDay = date.getDay();
  const weekday = jsDay === 0 ? 7 : jsDay;
  date.setDate(date.getDate() - (weekday - 1));
  return toDateKey(date);
}

function getWeekDates(dateKey: string) {
  const start = getWeekStart(dateKey);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

function formatDayLabel(dateKey: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zurich",
    weekday: "long",
    day: "2-digit",
    month: "short",
  }).format(new Date(`${dateKey}T12:00:00`));
}

function formatDateHeading(dateKey: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zurich",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(`${dateKey}T12:00:00`));
}

function formatDateRange(startDateKey: string, endDateKey: string) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zurich",
    day: "2-digit",
    month: "short",
  });
  const yearFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zurich",
    year: "numeric",
  });

  return `${formatter.format(new Date(`${startDateKey}T12:00:00`))} - ${formatter.format(
    new Date(`${endDateKey}T12:00:00`),
  )} ${yearFormatter.format(new Date(`${endDateKey}T12:00:00`))}`;
}

function getZurichParts(isoString: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date(isoString));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

function getDateKeyFromIso(isoString: string) {
  const parts = getZurichParts(isoString);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function getMinutesFromIso(isoString: string) {
  const parts = getZurichParts(isoString);
  return parts.hour * 60 + parts.minute;
}

function getSlotLabel(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function assignLanes<T extends { startMinutes: number; endMinutes: number }>(items: T[]) {
  const lanes: number[] = [];
  const laneIndexes = new Array(items.length).fill(0);

  items.forEach((item, index) => {
    let lane = 0;
    while (lane < lanes.length && lanes[lane] > item.startMinutes) {
      lane += 1;
    }

    if (lane === lanes.length) {
      lanes.push(item.endMinutes);
    } else {
      lanes[lane] = item.endMinutes;
    }

    laneIndexes[index] = lane;
  });

  return {
    laneIndexes,
    laneCount: Math.max(lanes.length, 1),
  };
}

function getStatusTone(status: AppointmentStatus) {
  switch (status) {
    case "completed":
      return "border-emerald-500/40 bg-emerald-500/12 text-emerald-100";
    case "cancelled":
      return "border-rose-500/30 bg-rose-500/10 text-rose-100";
    case "no_show":
      return "border-amber-500/40 bg-amber-500/12 text-amber-100";
    default:
      return "border-accent/50 bg-accent/15 text-foreground";
  }
}

function buildAppointments(appointments: AdminAppointmentDetail[]) {
  const grouped = new Map<string, AppointmentCard[]>();

  for (const appointment of appointments) {
    const dateKey = getDateKeyFromIso(appointment.start_at);
    const item = {
      ...appointment,
      dateKey,
      startMinutes: getMinutesFromIso(appointment.start_at),
      endMinutes: getMinutesFromIso(appointment.end_at),
      lane: 0,
      laneCount: 1,
    };
    const current = grouped.get(dateKey) ?? [];
    current.push(item);
    grouped.set(dateKey, current);
  }

  for (const [dateKey, items] of grouped) {
    items.sort((first, second) => {
      if (first.startMinutes !== second.startMinutes) {
        return first.startMinutes - second.startMinutes;
      }

      return first.endMinutes - second.endMinutes;
    });

    const { laneIndexes, laneCount } = assignLanes(items);
    grouped.set(
      dateKey,
      items.map((item, index) => ({
        ...item,
        lane: laneIndexes[index],
        laneCount,
      })),
    );
  }

  return grouped;
}

export default function AdminAppointmentsView({
  view,
  selectedDate,
  appointments,
  businessHours,
  exceptions,
  todayDateKey,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [appointmentState, setAppointmentState] = useState(appointments);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  const [draftNotes, setDraftNotes] = useState("");
  const [feedback, setFeedback] = useState("");
  const [isPending, startTransition] = useTransition();

  const exceptionsByDate = useMemo(
    () => new Map(exceptions.map((exception) => [exception.date, exception])),
    [exceptions],
  );
  useEffect(() => {
    setAppointmentState(appointments);
  }, [appointments]);

  const appointmentsByDate = useMemo(() => buildAppointments(appointmentState), [appointmentState]);
  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDate]);
  const weekStart = weekDates[0];
  const weekEnd = weekDates[6];
  const selectedDetail =
    appointmentState.find((appointment) => appointment.id === selectedAppointmentId) ?? null;

  useEffect(() => {
    setDraftNotes(selectedDetail?.notes ?? "");
    setFeedback("");
  }, [selectedDetail]);

  const effectiveHoursByDate = useMemo(
    () =>
      new Map(
        weekDates.map((dateKey) => {
          const effective = getEffectiveHours(parseDateKey(dateKey), businessHours, exceptionsByDate);
          return [dateKey, effective] as const;
        }),
      ),
    [businessHours, exceptionsByDate, weekDates],
  );

  const timeRange = useMemo(() => {
    const hours = Array.from(effectiveHoursByDate.values()).filter(
      (item) => !item.is_closed && item.open_time && item.close_time,
    );

    if (!hours.length) {
      return { start: 9 * 60, end: 18 * 60 };
    }

    const toMinutes = (value: string) => {
      const [hour, minute] = value.split(":").map(Number);
      return hour * 60 + minute;
    };

    return {
      start: Math.min(...hours.map((item) => toMinutes(item.open_time!))),
      end: Math.max(...hours.map((item) => toMinutes(item.close_time!))),
    };
  }, [effectiveHoursByDate]);

  const slotTimes = useMemo(() => {
    const slots: number[] = [];
    for (let minutes = timeRange.start; minutes < timeRange.end; minutes += SLOT_MINUTES) {
      slots.push(minutes);
    }
    return slots;
  }, [timeRange]);

  function updateQuery(nextView: ViewMode, nextDate: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", nextView);
    params.set("date", nextDate);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function saveAppointment(input: { status?: AppointmentStatus; notes?: string }) {
    if (!selectedDetail) {
      return;
    }

    startTransition(async () => {
      const result = await updateAdminAppointment({
        appointmentId: selectedDetail.id,
        status: input.status,
        notes: input.notes,
      });

      if (result.error) {
        setFeedback(result.error);
        return;
      }

      setAppointmentState((current) =>
        current.map((appointment) =>
          appointment.id === selectedDetail.id
            ? {
                ...appointment,
                status: input.status ?? appointment.status,
                notes:
                  typeof input.notes === "string"
                    ? input.notes.trim() || null
                    : appointment.notes,
              }
            : appointment,
        ),
      );
      router.refresh();
      setFeedback("Saved.");
    });
  }

  return (
    <section className="space-y-8">
      <div className="space-y-4">
        <p className="font-admin-primary text-xs uppercase tracking-[0.34em] text-foreground-secondary">
          Appointments
        </p>
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <h1 className="font-admin-display text-[clamp(2.2rem,5vw,4.25rem)] font-semibold uppercase leading-[0.95] tracking-[-0.04em] text-foreground">
              Appointments
            </h1>
            <p className="max-w-2xl font-admin-primary text-sm leading-7 text-foreground-secondary sm:text-base">
              Zurich-time scheduling with week, day, and grouped list views.
            </p>
          </div>

          <div className="inline-flex w-full max-w-md border border-border bg-surface p-1">
            {(["week", "day", "list"] as const).map((mode) => {
              const active = view === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => updateQuery(mode, selectedDate)}
                  className={`flex-1 px-4 py-3 font-admin-primary text-xs uppercase tracking-[0.24em] transition-colors ${
                    active
                      ? "bg-accent text-background"
                      : "text-foreground-secondary hover:bg-background hover:text-foreground"
                  }`}
                >
                  {mode}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 border border-border bg-surface px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="space-y-1">
          <p className="font-admin-primary text-xs uppercase tracking-[0.22em] text-foreground-muted">
            {view === "week" ? "Week Range" : view === "day" ? "Selected Day" : "List Range"}
          </p>
          <p className="font-admin-display text-2xl uppercase tracking-[-0.04em] text-foreground">
            {view === "day" ? formatDateHeading(selectedDate) : formatDateRange(weekStart, weekEnd)}
          </p>
        </div>

        <div className="flex gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() =>
              updateQuery(
                view,
                view === "day" ? addDays(selectedDate, -1) : addDays(selectedDate, -7),
              )
            }
            className="inline-flex min-h-11 items-center justify-center gap-2 border border-border px-4 font-admin-primary text-xs uppercase tracking-[0.18em] text-foreground-secondary transition-colors hover:bg-background hover:text-foreground"
          >
            <ChevronLeft size={16} />
            Previous
          </button>
          <button
            type="button"
            onClick={() =>
              updateQuery(
                view,
                view === "day" ? addDays(selectedDate, 1) : addDays(selectedDate, 7),
              )
            }
            className="inline-flex min-h-11 items-center justify-center gap-2 border border-border px-4 font-admin-primary text-xs uppercase tracking-[0.18em] text-foreground-secondary transition-colors hover:bg-background hover:text-foreground"
          >
            Next
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {view === "week" ? (
        <div className="border border-border bg-surface">
          <div className="overflow-x-auto">
            <div
              className="grid min-w-max"
              style={{
                gridTemplateColumns: `minmax(172px, 172px) repeat(${slotTimes.length}, minmax(92px, 92px))`,
              }}
            >
              <div className="sticky left-0 top-0 z-30 border-b border-r border-border bg-surface px-4 py-4" />
              {slotTimes.map((slot) => (
                <div
                  key={slot}
                  className="sticky top-0 z-20 border-b border-r border-border bg-surface px-3 py-4 text-center font-admin-primary text-xs uppercase tracking-[0.2em] text-foreground-secondary"
                >
                  {getSlotLabel(slot)}
                </div>
              ))}

              {weekDates.map((dateKey, rowIndex) => {
                const effectiveHours = effectiveHoursByDate.get(dateKey)!;
                const dayAppointments = appointmentsByDate.get(dateKey) ?? [];
                const laneCount = Math.max(...dayAppointments.map((item) => item.laneCount), 1);
                const rowHeight = effectiveHours.is_closed ? 88 : Math.max(96, laneCount * 72);
                const dayStart = effectiveHours.open_time
                  ? (() => {
                      const [hour, minute] = effectiveHours.open_time.split(":").map(Number);
                      return hour * 60 + minute;
                    })()
                  : null;
                const dayEnd = effectiveHours.close_time
                  ? (() => {
                      const [hour, minute] = effectiveHours.close_time.split(":").map(Number);
                      return hour * 60 + minute;
                    })()
                  : null;

                return (
                  <div key={dateKey} className="contents">
                    <div
                      className={`sticky left-0 z-20 border-b border-r border-border px-4 py-4 ${
                        dateKey === todayDateKey ? "bg-accent/10" : "bg-surface"
                      }`}
                      style={{ height: rowHeight }}
                    >
                      <p className="font-admin-display text-xl uppercase tracking-[-0.04em] text-foreground">
                        {WEEKDAY_NAMES[rowIndex]}
                      </p>
                      <p className="mt-1 font-admin-primary text-sm text-foreground-secondary">
                        {formatDayLabel(dateKey)}
                      </p>
                      <p className="mt-2 font-admin-primary text-[11px] uppercase tracking-[0.2em] text-foreground-muted">
                        {effectiveHours.is_closed
                          ? effectiveHours.reason || "Closed"
                          : `${effectiveHours.open_time?.slice(0, 5)}-${effectiveHours.close_time?.slice(0, 5)}`}
                      </p>
                    </div>

                    <div
                      className={`relative col-span-full border-b border-border ${
                        dateKey === todayDateKey ? "bg-accent/5" : "bg-background/40"
                      }`}
                      style={{
                        gridColumn: `2 / span ${slotTimes.length}`,
                        height: rowHeight,
                      }}
                    >
                      <div
                        className="absolute inset-0 grid"
                        style={{
                          gridTemplateColumns: `repeat(${slotTimes.length}, minmax(92px, 92px))`,
                        }}
                      >
                        {slotTimes.map((slot) => {
                          const outsideWorkingHours =
                            effectiveHours.is_closed ||
                            dayStart === null ||
                            dayEnd === null ||
                            slot < dayStart ||
                            slot >= dayEnd;

                          return (
                            <div
                              key={slot}
                              className={`border-r border-border ${
                                outsideWorkingHours ? "bg-background/70" : "bg-transparent"
                              }`}
                            />
                          );
                        })}
                      </div>

                      {effectiveHours.is_closed ? (
                        <div className="absolute inset-0 flex items-center justify-center px-4 text-center">
                          <p className="font-admin-primary text-sm uppercase tracking-[0.22em] text-foreground-muted">
                            {effectiveHours.reason || "Closed / non-working day"}
                          </p>
                        </div>
                      ) : null}

                      {dayAppointments.map((appointment) => {
                        const columnStart =
                          Math.max(0, Math.floor((appointment.startMinutes - timeRange.start) / SLOT_MINUTES)) + 1;
                        const span = Math.max(
                          1,
                          Math.ceil((appointment.endMinutes - appointment.startMinutes) / SLOT_MINUTES),
                        );

                        return (
                          <button
                            key={appointment.id}
                            type="button"
                            onClick={() => setSelectedAppointmentId(appointment.id)}
                            className={`absolute overflow-hidden border px-3 py-2 text-left transition-transform hover:-translate-y-0.5 ${getStatusTone(
                              appointment.status,
                            )}`}
                            style={{
                              left: `${(columnStart - 1) * 92}px`,
                              width: `${span * 92 - 6}px`,
                              top: `${appointment.lane * 68 + 10}px`,
                              height: "58px",
                            }}
                          >
                            <p className="truncate font-admin-display text-sm uppercase tracking-[-0.03em]">
                              {appointment.customer_name}
                            </p>
                            <p className="truncate font-admin-primary text-[11px] uppercase tracking-[0.16em] opacity-90">
                              {appointment.service_name}
                            </p>
                            <p className="truncate font-admin-primary text-[11px] opacity-80">
                              {appointment.time_label}
                              {span >= 2 ? ` • ${STATUS_LABELS[appointment.status]}` : ""}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {view === "day" ? (
        <div className="border border-border bg-surface p-4 sm:p-5">
          {(() => {
            const effectiveHours =
              getEffectiveHours(parseDateKey(selectedDate), businessHours, exceptionsByDate);
            const dayAppointments = appointmentsByDate.get(selectedDate) ?? [];
            const laneCount = Math.max(...dayAppointments.map((item) => item.laneCount), 1);
            const timelineStart = effectiveHours.open_time
              ? Math.min(timeRange.start, dayAppointments[0]?.startMinutes ?? timeRange.start)
              : timeRange.start;
            const timelineEnd = effectiveHours.close_time
              ? Math.max(timeRange.end, dayAppointments.at(-1)?.endMinutes ?? timeRange.end)
              : timeRange.end;
            const slotCount = Math.max(1, (timelineEnd - timelineStart) / SLOT_MINUTES);

            return (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-admin-primary text-xs uppercase tracking-[0.22em] text-foreground-muted">
                      Timeline
                    </p>
                    <p className="font-admin-display text-2xl uppercase tracking-[-0.04em] text-foreground">
                      {formatDateHeading(selectedDate)}
                    </p>
                  </div>
                  <p className="font-admin-primary text-xs uppercase tracking-[0.22em] text-foreground-secondary">
                    {effectiveHours.is_closed
                      ? effectiveHours.reason || "Closed"
                      : `${effectiveHours.open_time?.slice(0, 5)}-${effectiveHours.close_time?.slice(0, 5)}`}
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <div className="relative min-w-[680px] border border-border bg-background/40">
                    <div
                      className="grid"
                      style={{
                        gridTemplateColumns: `96px repeat(${laneCount}, minmax(0, 1fr))`,
                      }}
                    >
                      {Array.from({ length: slotCount + 1 }, (_, index) => {
                        const minutes = timelineStart + index * SLOT_MINUTES;
                        return (
                          <div key={minutes} className="contents">
                            <div className="border-b border-r border-border px-4 py-3 font-admin-primary text-xs uppercase tracking-[0.16em] text-foreground-secondary">
                              {index < slotCount ? getSlotLabel(minutes) : ""}
                            </div>
                            <div
                              className="col-span-full border-b border-border"
                              style={{ gridColumn: `2 / span ${laneCount}`, minHeight: "52px" }}
                            />
                          </div>
                        );
                      })}
                    </div>

                    {effectiveHours.is_closed ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/70 px-4 text-center">
                        <p className="font-admin-primary text-sm uppercase tracking-[0.22em] text-foreground-muted">
                          {effectiveHours.reason || "Closed / non-working day"}
                        </p>
                      </div>
                    ) : null}

                    {dayAppointments.map((appointment) => {
                      const top = ((appointment.startMinutes - timelineStart) / SLOT_MINUTES) * 52 + 1;
                      const height =
                        ((appointment.endMinutes - appointment.startMinutes) / SLOT_MINUTES) * 52 - 4;
                      const laneWidth = `calc((100% - 96px) / ${laneCount})`;

                      return (
                        <button
                          key={appointment.id}
                          type="button"
                          onClick={() => setSelectedAppointmentId(appointment.id)}
                          className={`absolute overflow-hidden border px-3 py-2 text-left transition-transform hover:-translate-y-0.5 ${getStatusTone(
                            appointment.status,
                          )}`}
                          style={{
                            left: `calc(96px + (${appointment.lane} * ${laneWidth}) + 4px)`,
                            width: `calc(${laneWidth} - 8px)`,
                            top: `${top}px`,
                            height: `${Math.max(height, 48)}px`,
                          }}
                        >
                          <p className="truncate font-admin-display text-sm uppercase tracking-[-0.03em]">
                            {appointment.customer_name}
                          </p>
                          <p className="truncate font-admin-primary text-[11px] uppercase tracking-[0.16em]">
                            {appointment.service_name}
                          </p>
                          <p className="truncate font-admin-primary text-[11px] opacity-80">
                            {appointment.time_label}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      ) : null}

      {view === "list" ? (
        <div className="space-y-4">
          {weekDates.map((dateKey) => {
            const dayAppointments = appointmentsByDate.get(dateKey) ?? [];
            const effectiveHours = effectiveHoursByDate.get(dateKey)!;

            return (
              <article key={dateKey} className="border border-border bg-surface px-4 py-5 sm:px-5">
                <div className="flex flex-col gap-2 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="font-admin-display text-2xl uppercase tracking-[-0.04em] text-foreground">
                      {formatDateHeading(dateKey)}
                    </p>
                    <p className="font-admin-primary text-xs uppercase tracking-[0.2em] text-foreground-secondary">
                      {effectiveHours.is_closed
                        ? effectiveHours.reason || "Closed"
                        : `${effectiveHours.open_time?.slice(0, 5)}-${effectiveHours.close_time?.slice(0, 5)}`}
                    </p>
                  </div>
                  <p className="font-admin-primary text-xs uppercase tracking-[0.18em] text-foreground-muted">
                    {dayAppointments.length} appointment{dayAppointments.length === 1 ? "" : "s"}
                  </p>
                </div>

                {dayAppointments.length === 0 ? (
                  <p className="pt-4 font-admin-primary text-sm leading-6 text-foreground-secondary">
                    No appointments scheduled.
                  </p>
                ) : (
                  <div className="divide-y divide-border">
                    {dayAppointments.map((appointment) => (
                      <button
                        key={appointment.id}
                        type="button"
                        onClick={() => setSelectedAppointmentId(appointment.id)}
                        className="grid w-full grid-cols-1 gap-3 py-4 text-left transition-colors hover:bg-background/40 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto_auto]"
                      >
                        <div>
                          <p className="font-admin-display text-xl uppercase tracking-[-0.04em] text-foreground">
                            {appointment.customer_name}
                          </p>
                          <p className="font-admin-primary text-xs uppercase tracking-[0.18em] text-foreground-muted">
                            {appointment.booking_type === "customer" ? "Registered customer" : "Guest booking"}
                          </p>
                        </div>
                        <div>
                          <p className="font-admin-primary text-sm uppercase tracking-[0.18em] text-foreground">
                            {appointment.service_name}
                          </p>
                          <p className="font-admin-primary text-sm text-foreground-secondary">
                            {appointment.time_label}
                          </p>
                        </div>
                        <p className="font-admin-primary text-xs uppercase tracking-[0.18em] text-foreground-secondary">
                          {STATUS_LABELS[appointment.status]}
                        </p>
                        <p className="font-admin-primary text-xs uppercase tracking-[0.18em] text-foreground-muted">
                          {appointment.booking_type}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : null}

      {selectedDetail ? (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-background/80 p-4 backdrop-blur-sm sm:items-center sm:p-6">
          <div className="w-full max-w-2xl border border-border bg-surface px-5 py-6 sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <p className="font-admin-primary text-xs uppercase tracking-[0.34em] text-foreground-secondary">
                  Appointment
                </p>
                <h2 className="font-admin-display text-2xl uppercase tracking-[-0.04em] text-foreground sm:text-3xl">
                  {selectedDetail.customer_name}
                </h2>
                <p className="font-admin-primary text-sm leading-7 text-foreground-secondary">
                  {selectedDetail.service_name} • {selectedDetail.date_label} • {selectedDetail.time_label}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAppointmentId(null)}
                className="inline-flex h-11 w-11 items-center justify-center border border-border text-foreground-secondary transition-colors hover:bg-background hover:text-foreground"
                aria-label="Close appointment panel"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="border border-border bg-background/40 px-4 py-4">
                <p className="font-admin-primary text-xs uppercase tracking-[0.18em] text-foreground-muted">
                  Contact
                </p>
                <p className="mt-2 font-admin-display text-xl uppercase tracking-[-0.04em] text-foreground">
                  {selectedDetail.customer_name}
                </p>
                <p className="mt-2 font-admin-primary text-sm text-foreground-secondary">
                  {selectedDetail.customer_email || "No email"}
                </p>
                <p className="mt-1 font-admin-primary text-sm text-foreground-secondary">
                  {selectedDetail.customer_phone || "No phone"}
                </p>
                <p className="mt-3 font-admin-primary text-xs uppercase tracking-[0.18em] text-foreground-muted">
                  {selectedDetail.booking_type === "customer" ? "Registered customer" : "Guest"}
                </p>
              </div>

              <div className="border border-border bg-background/40 px-4 py-4">
                <p className="font-admin-primary text-xs uppercase tracking-[0.18em] text-foreground-muted">
                  Schedule
                </p>
                <p className="mt-2 font-admin-primary text-sm text-foreground-secondary">
                  Date: {selectedDetail.date_label}
                </p>
                <p className="mt-1 font-admin-primary text-sm text-foreground-secondary">
                  Start: {formatZurichTime(selectedDetail.start_at)}
                </p>
                <p className="mt-1 font-admin-primary text-sm text-foreground-secondary">
                  End: {formatZurichTime(selectedDetail.end_at)}
                </p>
                <p className="mt-3 font-admin-primary text-xs uppercase tracking-[0.18em] text-foreground-muted">
                  Status: {STATUS_LABELS[selectedDetail.status]}
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              <label className="block">
                <span className="font-admin-primary text-xs uppercase tracking-[0.18em] text-foreground-muted">
                  Notes
                </span>
                <textarea
                  value={draftNotes}
                  onChange={(event) => setDraftNotes(event.target.value)}
                  rows={5}
                  className="mt-2 w-full border border-border bg-background px-4 py-3 font-admin-primary text-sm text-foreground outline-none transition-colors placeholder:text-foreground-muted focus:border-foreground-secondary"
                  placeholder="Add internal notes for this appointment"
                />
              </label>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {(["confirmed", "completed", "cancelled", "no_show"] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  disabled={isPending}
                  onClick={() => saveAppointment({ status, notes: draftNotes })}
                  className="inline-flex min-h-11 items-center justify-center border border-border px-4 font-admin-primary text-xs uppercase tracking-[0.18em] text-foreground-secondary transition-colors hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:text-foreground-muted"
                >
                  Mark {STATUS_LABELS[status]}
                </button>
              ))}
              <button
                type="button"
                disabled={isPending}
                onClick={() => saveAppointment({ notes: draftNotes })}
                className="inline-flex min-h-11 items-center justify-center border border-border bg-accent px-4 font-admin-primary text-xs uppercase tracking-[0.18em] text-background transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-background-secondary disabled:text-foreground-muted"
              >
                Save Notes
              </button>
            </div>

            {feedback ? (
              <p className="mt-4 font-admin-primary text-sm text-foreground-secondary">
                {feedback}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
