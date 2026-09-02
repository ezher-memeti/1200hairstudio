"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Minus, Plus, X } from "lucide-react";

type Mode = "date" | "time" | "datetime";
type Props = { value: string; onChange: (value: string) => void; label?: string; placeholder?: string; disabled?: boolean; required?: boolean; minDate?: string; maxDate?: string; minuteStep?: number; mode?: Mode; error?: string; className?: string; clearable?: boolean };
const weekdays = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^\d{2}:\d{2}$/;
const pad = (value: number) => String(value).padStart(2, "0");

function parseDateKey(value: string) {
  if (!datePattern.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}
function toDateKey(date: Date) { return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`; }
function todayInZurich() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function splitValue(value: string, mode: Mode) {
  if (mode === "date") return { date: datePattern.test(value) ? value : "", time: "" };
  if (mode === "time") return { date: "", time: timePattern.test(value) ? value : "" };
  const [date = "", rawTime = ""] = value.split("T");
  const time = rawTime.slice(0, 5);
  return { date: datePattern.test(date) ? date : "", time: timePattern.test(time) ? time : "" };
}
function formatDate(value: string) {
  const date = parseDateKey(value);
  return date ? new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" }).format(date) : "";
}

function TimeStepper({ label, value, onDecrease, onIncrease, onWheel }: { label: "Hour" | "Minute"; value: number; onDecrease: () => void; onIncrease: () => void; onWheel: (direction: number) => void }) {
  const [draft, setDraft] = useState(pad(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(pad(value));
  }, [value]);

  function commit() {
    if (!draft.trim()) {
      setDraft(pad(value));
      return;
    }
    const parsed = Number.parseInt(draft, 10);
    const max = label === "Hour" ? 23 : 59;
    const nextValue = Number.isFinite(parsed) ? Math.max(0, Math.min(max, parsed)) : value;
    setDraft(pad(nextValue));
    inputRef.current?.dispatchEvent(new CustomEvent("admin-time-commit", { bubbles: true, detail: { label, value: nextValue } }));
  }

  return <div><p className="mb-2 text-center text-[9px] uppercase tracking-[0.16em] text-foreground-muted">{label}</p><div className="flex items-center justify-center gap-2" onWheel={(event) => { event.preventDefault(); onWheel(event.deltaY > 0 ? 1 : -1); }}><button type="button" tabIndex={-1} aria-label={`Previous ${label.toLowerCase()}`} onClick={onDecrease} className="inline-flex size-10 items-center justify-center rounded-[3px] border border-border text-foreground-secondary hover:border-accent hover:text-accent"><Minus size={14} /></button><input ref={inputRef} type="text" inputMode="numeric" pattern="[0-9]*" maxLength={2} aria-label={label} value={draft} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setDraft(event.target.value.replace(/\D/g, "").slice(0, 2))} onBlur={commit} onKeyDown={(event) => { if (event.key === "ArrowUp") { event.preventDefault(); onIncrease(); } else if (event.key === "ArrowDown") { event.preventDefault(); onDecrease(); } else if (event.key === "Enter") { event.preventDefault(); commit(); } else if (event.key === "Escape") { setDraft(pad(value)); } }} className="w-10 appearance-none border-0 bg-transparent p-0 text-center font-admin-display text-2xl text-foreground caret-accent outline-none transition-colors focus:text-accent [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" /><button type="button" tabIndex={-1} aria-label={`Next ${label.toLowerCase()}`} onClick={onIncrease} className="inline-flex size-10 items-center justify-center rounded-[3px] border border-border text-foreground-secondary hover:border-accent hover:text-accent"><Plus size={14} /></button></div></div>;
}

export default function DateTimePicker({ value, onChange, label, placeholder = "Select date and time", disabled = false, required = false, minDate, maxDate, minuteStep = 1, mode = "datetime", error, className = "", clearable = false }: Props) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [openPanel, setOpenPanel] = useState<"date" | "time" | null>(null);
  const parts = splitValue(value, mode);
  const initialMonth = parseDateKey(parts.date) ?? parseDateKey(todayInZurich())!;
  const [visibleMonth, setVisibleMonth] = useState(() => ({ year: initialMonth.getUTCFullYear(), month: initialMonth.getUTCMonth() }));
  const step = Math.max(1, Math.min(60, Math.floor(minuteStep)));
  const [hour, minute] = parts.time ? parts.time.split(":").map(Number) : [0, 0];

  useEffect(() => {
    const close = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpenPanel(null); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  useEffect(() => {
    const selected = parseDateKey(parts.date);
    if (openPanel === "date" && selected) setVisibleMonth({ year: selected.getUTCFullYear(), month: selected.getUTCMonth() });
  }, [openPanel, parts.date]);
  useEffect(() => {
    const root = rootRef.current;
    const commitTime = (event: Event) => {
      const { label: field, value: nextValue } = (event as CustomEvent<{ label: "Hour" | "Minute"; value: number }>).detail;
      const nextTime = field === "Hour" ? `${pad(nextValue)}:${pad(minute)}` : `${pad(hour)}:${pad(nextValue)}`;
      onChange(mode === "time" ? nextTime : `${parts.date}T${nextTime}`);
    };
    root?.addEventListener("admin-time-commit", commitTime);
    return () => root?.removeEventListener("admin-time-commit", commitTime);
  }, [hour, minute, mode, onChange, parts.date]);

  const days = useMemo(() => {
    const first = new Date(Date.UTC(visibleMonth.year, visibleMonth.month, 1, 12));
    const offset = (first.getUTCDay() + 6) % 7;
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(Date.UTC(visibleMonth.year, visibleMonth.month, index - offset + 1, 12));
      const key = toDateKey(date);
      return { key, number: date.getUTCDate(), currentMonth: date.getUTCMonth() === visibleMonth.month, disabled: Boolean((minDate && key < minDate.slice(0, 10)) || (maxDate && key > maxDate.slice(0, 10))) };
    });
  }, [maxDate, minDate, visibleMonth]);

  function emit(nextDate: string, nextTime: string) { onChange(mode === "date" ? nextDate : mode === "time" ? nextTime : nextDate || nextTime ? `${nextDate}T${nextTime}` : ""); }
  function selectDate(nextDate: string) { emit(nextDate, parts.time || "00:00"); setOpenPanel(mode === "datetime" ? "time" : null); }
  function changeTime(hourOffset: number, minuteOffset: number) {
    const total = ((hour * 60 + minute + hourOffset * 60 + minuteOffset) % 1440 + 1440) % 1440;
    emit(parts.date, `${pad(Math.floor(total / 60))}:${pad(total % 60)}`);
  }
  function moveMonth(offset: number) {
    const date = new Date(Date.UTC(visibleMonth.year, visibleMonth.month + offset, 1, 12));
    setVisibleMonth({ year: date.getUTCFullYear(), month: date.getUTCMonth() });
  }
  function handleRootKey(event: React.KeyboardEvent) {
    if (event.key === "Escape") setOpenPanel(null);
    else if (!openPanel && ["ArrowDown", "Enter", " "].includes(event.key)) { event.preventDefault(); setOpenPanel(mode === "time" ? "time" : "date"); }
  }
  function handleDayKey(event: React.KeyboardEvent<HTMLButtonElement>) {
    const offset = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number>)[event.key];
    if (!offset) return;
    event.preventDefault();
    const buttons = Array.from(rootRef.current?.querySelectorAll<HTMLButtonElement>("[data-calendar-day]:not(:disabled)") ?? []);
    const index = buttons.indexOf(event.currentTarget);
    buttons[Math.max(0, Math.min(buttons.length - 1, index + offset))]?.focus();
  }
  function clear(event: React.MouseEvent) { event.stopPropagation(); onChange(""); setOpenPanel(null); }

  const controlClass = `flex min-h-11 w-full min-w-0 items-center gap-3 rounded-[3px] border bg-[#11110f] px-4 py-3 text-left text-sm outline-none transition-all ${error ? "border-red-500/60" : openPanel ? "border-accent shadow-[0_0_0_1px_rgba(216,177,116,.2)]" : "border-border hover:border-foreground-muted focus:border-accent"} disabled:cursor-not-allowed disabled:opacity-50`;
  const clearButton = <button type="button" title="Clear" aria-label="Clear" onClick={clear} className="absolute right-1.5 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-[3px] text-foreground-muted transition-colors hover:bg-surface hover:text-accent"><X size={14} /></button>;

  return <div ref={rootRef} className={`relative ${className}`} onKeyDown={handleRootKey}>{label ? <label id={`${id}-label`} className="mb-2 block text-[10px] uppercase tracking-[0.16em] text-foreground-muted">{label}{required ? " *" : ""}</label> : null}<div className={`grid gap-2 ${mode === "datetime" ? "grid-cols-[minmax(0,1fr)_minmax(108px,.55fr)]" : "grid-cols-1"}`}>{mode !== "time" ? <div className="relative min-w-0"><button type="button" disabled={disabled} aria-expanded={openPanel === "date"} aria-haspopup="dialog" aria-labelledby={label ? `${id}-label` : undefined} onClick={() => setOpenPanel(openPanel === "date" ? null : "date")} className={`${controlClass} ${clearable && value && mode === "date" ? "pr-11" : ""}`}><CalendarDays size={16} className="shrink-0 text-accent" /><span className={parts.date ? "truncate text-foreground" : "truncate text-foreground-muted"}>{parts.date ? formatDate(parts.date) : mode === "date" ? placeholder : "Select date"}</span></button>{clearable && value && mode === "date" && !disabled ? clearButton : null}</div> : null}{mode !== "date" ? <div className="relative min-w-0"><button type="button" disabled={disabled} aria-expanded={openPanel === "time"} aria-haspopup="dialog" aria-labelledby={label ? `${id}-label` : undefined} onClick={() => setOpenPanel(openPanel === "time" ? null : "time")} className={`${controlClass} ${clearable && value ? "pr-11" : ""}`}><Clock size={16} className="shrink-0 text-accent" /><span className={parts.time ? "text-foreground" : "text-foreground-muted"}>{parts.time || (mode === "time" ? placeholder : "Time")}</span></button>{clearable && value && !disabled ? clearButton : null}</div> : null}</div>{error ? <p className="mt-1.5 text-xs text-red-300">{error}</p> : null}{openPanel === "date" ? <div role="dialog" aria-label={`${label ?? "Date"} calendar`} className="absolute left-0 z-[80] mt-2 w-[min(340px,calc(100vw-2rem))] rounded-[4px] border border-border bg-[#11110f] p-4 shadow-2xl"><div className="flex items-center justify-between"><button type="button" aria-label="Previous month" onClick={() => moveMonth(-1)} className="inline-flex size-10 items-center justify-center border border-border text-foreground-secondary hover:border-accent hover:text-accent"><ChevronLeft size={16} /></button><p className="font-admin-display text-base text-foreground">{new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(Date.UTC(visibleMonth.year, visibleMonth.month, 1)))}</p><button type="button" aria-label="Next month" onClick={() => moveMonth(1)} className="inline-flex size-10 items-center justify-center border border-border text-foreground-secondary hover:border-accent hover:text-accent"><ChevronRight size={16} /></button></div><div className="mt-4 grid grid-cols-7 text-center text-[9px] uppercase tracking-[.12em] text-foreground-muted">{weekdays.map((day) => <span key={day} className="py-2">{day}</span>)}</div><div className="grid grid-cols-7 gap-1">{days.map((day) => { const selected = day.key === parts.date; const today = day.key === todayInZurich(); return <button key={day.key} type="button" data-calendar-day disabled={day.disabled} onKeyDown={handleDayKey} aria-label={day.key} aria-pressed={selected} onClick={() => selectDate(day.key)} className={`min-h-10 rounded-[3px] text-sm outline-none transition-colors focus:ring-1 focus:ring-accent ${selected ? "bg-accent font-semibold text-background" : day.currentMonth ? "text-foreground hover:bg-surface" : "text-foreground-muted/50 hover:bg-surface"} ${today && !selected ? "ring-1 ring-accent/60 text-accent" : ""} disabled:cursor-not-allowed disabled:text-foreground-muted/20 disabled:line-through`}>{day.number}</button>; })}</div></div> : null}{openPanel === "time" ? <div role="dialog" aria-label={`${label ?? "Time"} selector`} className="absolute right-0 z-[80] mt-2 w-[min(360px,calc(100vw-2rem))] rounded-[4px] border border-border bg-[#11110f] p-4 shadow-2xl"><p className="text-center text-[10px] uppercase tracking-[0.2em] text-foreground-muted">Time</p><div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-end gap-3"><TimeStepper label="Hour" value={hour} onDecrease={() => changeTime(-1, 0)} onIncrease={() => changeTime(1, 0)} onWheel={(direction) => changeTime(direction, 0)} /><span className="pb-2 font-admin-display text-2xl text-foreground-muted">:</span><TimeStepper label="Minute" value={minute} onDecrease={() => changeTime(0, -1)} onIncrease={() => changeTime(0, 1)} onWheel={(direction) => changeTime(0, direction * step)} /></div><button type="button" onClick={() => setOpenPanel(null)} className="mt-5 min-h-11 w-full rounded-[3px] bg-accent px-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-background">Done · {pad(hour)}:{pad(minute)}</button></div> : null}</div>;
}
