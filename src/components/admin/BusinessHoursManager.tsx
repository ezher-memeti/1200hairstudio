"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { updateBusinessHours } from "@/app/admin/(dashboard)/settings/actions";
import type { BusinessHourRecord } from "@/lib/business-hours/types";

type BusinessHoursManagerProps = {
  initialHours: BusinessHourRecord[];
  loadError?: string | null;
};

type HourFormRow = {
  id: string;
  day_of_week: number;
  is_closed: boolean;
  open_time: string;
  close_time: string;
  previous_open_time: string;
  previous_close_time: string;
};

const dayNames = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

function toFormRow(hour: BusinessHourRecord): HourFormRow {
  const openTime = hour.open_time ?? "09:00";
  const closeTime = hour.close_time ?? "18:00";

  return {
    id: hour.id,
    day_of_week: hour.day_of_week,
    is_closed: hour.is_closed,
    open_time: hour.open_time ?? "",
    close_time: hour.close_time ?? "",
    previous_open_time: openTime,
    previous_close_time: closeTime,
  };
}

export default function BusinessHoursManager({
  initialHours,
  loadError,
}: BusinessHoursManagerProps) {
  const [rows, setRows] = useState<HourFormRow[]>(
    initialHours
      .slice()
      .sort((first, second) => first.day_of_week - second.day_of_week)
      .map(toFormRow),
  );
  const [feedback, setFeedback] = useState("");
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved"
  >("idle");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (saveState !== "saved") {
      return;
    }

    const timeout = window.setTimeout(() => {
      setSaveState("idle");
    }, 1800);

    return () => window.clearTimeout(timeout);
  }, [saveState]);

  const sortedRows = useMemo(
    () =>
      rows
        .slice()
        .sort(
          (first, second) =>
            first.day_of_week - second.day_of_week,
        ),
    [rows],
  );

  function updateRow(
    rowId: string,
    nextValues: Partial<HourFormRow>,
  ) {
    setRows((current) =>
      current.map((row) =>
        row.id === rowId
          ? {
              ...row,
              ...nextValues,
            }
          : row,
      ),
    );
  }

  function toggleClosed(rowId: string, nextClosed: boolean) {
    setRows((current) =>
      current.map((row) => {
        if (row.id !== rowId) {
          return row;
        }

        if (nextClosed) {
          return {
            ...row,
            is_closed: true,
            previous_open_time:
              row.open_time || row.previous_open_time,
            previous_close_time:
              row.close_time || row.previous_close_time,
            open_time: "",
            close_time: "",
          };
        }

        return {
          ...row,
          is_closed: false,
          open_time:
            row.previous_open_time || row.open_time || "09:00",
          close_time:
            row.previous_close_time || row.close_time || "18:00",
        };
      }),
    );
  }

  function copyMondayToWeekdays() {
    const monday = rows.find((row) => row.day_of_week === 1);

    if (!monday) {
      return;
    }

    setRows((current) =>
      current.map((row) => {
        if (row.day_of_week < 1 || row.day_of_week > 5) {
          return row;
        }

        return {
          ...row,
          is_closed: monday.is_closed,
          open_time: monday.is_closed ? "" : monday.open_time,
          close_time: monday.is_closed ? "" : monday.close_time,
          previous_open_time: monday.previous_open_time,
          previous_close_time: monday.previous_close_time,
        };
      }),
    );
  }

  function setWeekendClosed() {
    setRows((current) =>
      current.map((row) =>
        row.day_of_week === 6 || row.day_of_week === 7
          ? {
              ...row,
              is_closed: true,
              previous_open_time:
                row.open_time || row.previous_open_time,
              previous_close_time:
                row.close_time || row.previous_close_time,
              open_time: "",
              close_time: "",
            }
          : row,
      ),
    );
  }

  function saveChanges() {
    setFeedback("");
    setSaveState("saving");

    startTransition(async () => {
      for (const row of sortedRows) {
        if (!row.is_closed && (!row.open_time || !row.close_time)) {
          setFeedback("Set opening and closing times for each working day.");
          setSaveState("idle");
          return;
        }
      }

      const result = await updateBusinessHours(
        sortedRows.map((row) => ({
          id: row.id,
          is_closed: row.is_closed,
          open_time: row.is_closed ? null : row.open_time,
          close_time: row.is_closed ? null : row.close_time,
        })),
      );

      if (result.error) {
        setFeedback(result.error);
        setSaveState("idle");
        return;
      }

      setFeedback("");
      setSaveState("saved");
    });
  }

  return (
    <section className="space-y-8">
      <div className="space-y-4">
        <p className="font-primary text-xs uppercase tracking-[0.34em] text-foreground-secondary">
          Settings
        </p>
        <div className="space-y-2">
          <h1 className="font-display text-[clamp(2.2rem,5vw,4.25rem)] font-semibold uppercase leading-[0.95] tracking-[-0.04em] text-foreground">
            Business Hours
          </h1>
          <p className="max-w-2xl font-primary text-sm leading-7 text-foreground-secondary sm:text-base">
            Manage studio opening hours for each day of the week.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          onClick={copyMondayToWeekdays}
          className="inline-flex min-h-11 items-center justify-center border border-border px-4 py-2 font-primary text-xs uppercase tracking-[0.18em] text-foreground-secondary transition-colors hover:bg-surface hover:text-foreground"
        >
          Copy Monday to weekdays
        </button>
        <button
          type="button"
          onClick={setWeekendClosed}
          className="inline-flex min-h-11 items-center justify-center border border-border px-4 py-2 font-primary text-xs uppercase tracking-[0.18em] text-foreground-secondary transition-colors hover:bg-surface hover:text-foreground"
        >
          Set weekend closed
        </button>
      </div>

      {loadError ? (
        <div className="border border-border bg-surface px-5 py-5">
          <p className="font-primary text-sm leading-7 text-foreground-secondary">
            {loadError}
          </p>
        </div>
      ) : null}

      {feedback ? (
        <div className="border border-border bg-surface px-5 py-4">
          <p className="font-primary text-sm text-foreground-secondary">
            {feedback}
          </p>
        </div>
      ) : null}

      <div className="space-y-3">
        {sortedRows.map((row) => (
          <div
            key={row.id}
            className="border border-border bg-surface px-4 py-4 sm:px-5"
          >
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.2fr)_auto_minmax(7.5rem,9rem)_minmax(7.5rem,9rem)] lg:items-center">
              <div className="space-y-1">
                <p className="font-display text-xl uppercase tracking-[-0.04em] text-foreground">
                  {dayNames[row.day_of_week - 1] ?? `Day ${row.day_of_week}`}
                </p>
              </div>

              <label className="inline-flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={!row.is_closed}
                  onChange={(event) =>
                    toggleClosed(row.id, !event.target.checked)
                  }
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                <span className="font-primary text-sm uppercase tracking-[0.18em] text-foreground-secondary">
                  {row.is_closed ? "Closed" : "Working"}
                </span>
              </label>

              <label className="space-y-2">
                <span className="font-primary text-[11px] uppercase tracking-[0.2em] text-foreground-muted">
                  Opening
                </span>
                <input
                  type="time"
                  value={row.open_time}
                  disabled={row.is_closed}
                  onChange={(event) =>
                    updateRow(row.id, {
                      open_time: event.target.value,
                      previous_open_time: event.target.value || row.previous_open_time,
                    })
                  }
                  className="w-full border border-border bg-transparent px-3 py-2 font-primary text-sm text-foreground outline-none transition-colors disabled:cursor-not-allowed disabled:text-foreground-muted"
                />
              </label>

              <label className="space-y-2">
                <span className="font-primary text-[11px] uppercase tracking-[0.2em] text-foreground-muted">
                  Closing
                </span>
                <input
                  type="time"
                  value={row.close_time}
                  disabled={row.is_closed}
                  onChange={(event) =>
                    updateRow(row.id, {
                      close_time: event.target.value,
                      previous_close_time: event.target.value || row.previous_close_time,
                    })
                  }
                  className="w-full border border-border bg-transparent px-3 py-2 font-primary text-sm text-foreground outline-none transition-colors disabled:cursor-not-allowed disabled:text-foreground-muted"
                />
              </label>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-h-6">
          {saveState === "saved" ? (
            <p className="font-primary text-sm text-success">Saved</p>
          ) : null}
          {saveState === "saving" || isPending ? (
            <p className="font-primary text-sm text-foreground-secondary">
              Saving...
            </p>
          ) : null}
        </div>

        <button
          type="button"
          disabled={isPending || !!loadError}
          onClick={saveChanges}
          className="inline-flex min-h-12 items-center justify-center border border-border bg-accent px-5 py-3 font-primary text-sm uppercase tracking-[0.18em] text-background transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface disabled:text-foreground-muted"
        >
          Save Changes
        </button>
      </div>
    </section>
  );
}
