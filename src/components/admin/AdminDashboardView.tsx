"use client";

/* eslint-disable react/no-unescaped-entities */

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  CreditCard,
  Megaphone,
  Plus,
  Receipt,
  Scissors,
} from "lucide-react";
import { ComparisonLine } from "@/components/admin/finance/FinanceOverview";
import type { AdminAppointmentDetail } from "@/lib/appointments/types";
import type { FinanceComparison } from "@/lib/finance/comparison";
import type { FinanceAppointment, FinanceTransaction } from "@/lib/finance/types";
import type { ReceiptRecord } from "@/lib/receipts/types";
import type { RegisterSessionDetail } from "@/lib/register/types";
import type { AvailableSlotDisplay } from "@/lib/public/available-slots";
import type { ServiceRecord } from "@/lib/services/types";

type Props = {
  today: string;
  now: string;
  todayAppointments: AdminAppointmentDetail[];
  tomorrowAppointments: AdminAppointmentDetail[];
  availableSlots: AvailableSlotDisplay[];
  availabilityService: ServiceRecord | null;
  todayComparison: FinanceComparison;
  monthComparison: FinanceComparison;
  sevenDayComparison: FinanceComparison;
  thirtyDayComparison: FinanceComparison;
  finance: {
    transactions: FinanceTransaction[];
    appointments: FinanceAppointment[];
    receipts: ReceiptRecord[];
  };
  register: RegisterSessionDetail | null;
};

const money = (value: number) =>
  new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF" }).format(value);
const time = (value: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zurich",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
const zurichDateKey = (value: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
const fullDate = (value: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zurich",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
const duration = (start: string, end: string) =>
  `${Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000))} min`;

export default function AdminDashboardView(props: Props) {
  const [trendRange, setTrendRange] = useState<"7" | "30">("7");
  const trend = trendRange === "7" ? props.sevenDayComparison : props.thirtyDayComparison;
  const nowMs = new Date(props.now).getTime();
  const active = props.todayAppointments.filter(
    (item) => !["cancelled", "no_show"].includes(item.status),
  );
  const next = active.find((item) => new Date(item.end_at).getTime() >= nowMs) ?? null;
  const financeByAppointment = new Map(
    props.finance.appointments.map((item) => [item.appointmentId, item]),
  );
  const month = props.monthComparison.current.totals;
  const topService = props.monthComparison.servicePerformance[0]?.service ?? "No data";
  const outstanding = props.finance.appointments.filter((item) => item.amountDue > item.netPaid);
  const outstandingTotal = outstanding.reduce(
    (sum, item) => sum + Math.max(0, item.amountDue - item.netPaid),
    0,
  );
  const unsentReceipts = props.finance.receipts.filter((item) => !item.emailed_at);
  const activities = buildActivity(props).slice(0, 8);
  const kpis = [
    {
      label: "Today's Appointments",
      value: String(active.length).padStart(2, "0"),
      detail: fullDate(props.now),
    },
    {
      label: "Today's Revenue",
      value: money(props.todayComparison.current.totals.netRevenue),
      detail: deltaLabel(props.todayComparison.changes.netRevenue),
    },
    {
      label: "Next Appointment",
      value: next ? time(next.start_at) : "—",
      detail: next ? `${next.customer_name} · ${next.service_name}` : "No upcoming appointment",
    },
    {
      label: "Available Slots",
      value: String(props.availableSlots.length).padStart(2, "0"),
      detail: props.availabilityService ? `For ${props.availabilityService.name}` : "No active service",
    },
  ];

  return (
    <section className="min-w-0 space-y-4 sm:space-y-5 xl:space-y-6">
      <header className="flex min-w-0 flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between sm:gap-6 xl:pb-6">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.28em] text-foreground-secondary sm:text-xs sm:tracking-[0.34em]">
            Dashboard
          </p>
          <h1 className="mt-2 font-admin-display text-[2.5rem] font-semibold uppercase leading-none tracking-[-0.04em] text-foreground sm:text-5xl xl:text-6xl">
            Good Day
          </h1>
          <p className="mt-2 break-words text-xs leading-5 text-foreground-secondary sm:text-sm">
            {fullDate(props.now)} · Europe/Zurich
          </p>
        </div>
        <Link
          href="/admin/appointments?new=1"
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 bg-accent px-5 text-[11px] uppercase tracking-[.16em] text-background sm:w-auto"
        >
          <Plus size={15} />
          New Appointment
        </Link>
      </header>

      <div className="grid min-w-0 grid-cols-2 gap-2.5 xl:grid-cols-4 xl:gap-3">
        {kpis.map((item) => (
          <article key={item.label} className="min-w-0 border border-border bg-surface p-3.5 sm:p-4">
            <p className="text-[8px] uppercase tracking-[.14em] text-foreground-muted sm:text-[10px] sm:tracking-[.18em]">
              {item.label}
            </p>
            <p className="mt-2 break-words font-admin-display text-2xl leading-none tracking-[-.04em] text-foreground sm:text-3xl">
              {item.value}
            </p>
            <p className="mt-1.5 line-clamp-2 break-words text-[10px] leading-4 text-foreground-secondary sm:text-xs sm:leading-5">
              {item.detail}
            </p>
          </article>
        ))}
      </div>

      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1.8fr)_minmax(260px,.75fr)] xl:gap-5">
        <Schedule
          appointments={props.todayAppointments}
          financeByAppointment={financeByAppointment}
          nextId={next?.id ?? null}
          nowMs={nowMs}
          slots={props.availableSlots}
        />
        <RegisterCard register={props.register} />
      </div>

      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1.8fr)_minmax(260px,.75fr)] xl:gap-5">
        <RevenuePerformance trend={trend} trendRange={trendRange} onRangeChange={setTrendRange} />
        <BusinessSnapshot month={month} topService={topService} />
      </div>

      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-2 xl:gap-5">
        <RecentActivity activities={activities} />
        <Attention
          outstandingCount={outstanding.length}
          outstandingTotal={outstandingTotal}
          unsentReceipts={unsentReceipts.length}
          tomorrowBookings={props.tomorrowAppointments.filter((item) => item.status === "confirmed").length}
        />
      </div>

      <QuickActions />
    </section>
  );
}

function Schedule({
  appointments,
  financeByAppointment,
  nextId,
  nowMs,
  slots,
}: {
  appointments: AdminAppointmentDetail[];
  financeByAppointment: Map<string, FinanceAppointment>;
  nextId: string | null;
  nowMs: number;
  slots: AvailableSlotDisplay[];
}) {
  return (
    <section className="min-w-0 overflow-hidden border border-border bg-surface">
      <div className="flex min-w-0 items-end justify-between gap-4 border-b border-border p-4 sm:px-5 sm:py-4">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[.18em] text-foreground-muted">Today's Schedule</p>
          <h2 className="mt-1.5 break-words font-admin-display text-xl uppercase text-foreground sm:text-2xl">
            Appointments
          </h2>
        </div>
        <Link
          href="/admin/appointments"
          className="inline-flex min-h-11 shrink-0 items-center text-right text-[9px] uppercase tracking-[.12em] text-accent sm:min-h-0 sm:text-[11px]"
        >
          View All <span className="hidden sm:inline">Appointments</span>&nbsp;→
        </Link>
      </div>
      <div className="divide-y divide-border">
        {appointments.map((item) => {
          const finance = financeByAppointment.get(item.id);
          const past = new Date(item.end_at).getTime() < nowMs;
          return (
            <Link
              key={item.id}
              href={`/admin/appointments?view=day&date=${zurichDateKey(item.start_at)}&appointmentId=${item.id}`}
              className={`grid min-w-0 grid-cols-[3.25rem_minmax(0,1fr)_auto] gap-x-3 gap-y-1 px-4 py-3 transition-colors hover:bg-background/50 sm:grid-cols-[60px_minmax(0,1.15fr)_minmax(0,.9fr)_65px_82px_auto] sm:items-center sm:px-5 ${past ? "opacity-45" : item.id === nextId ? "bg-accent/[.07]" : ""}`}
            >
              <strong className="row-span-2 text-sm text-accent sm:row-span-1 sm:text-base">
                {time(item.start_at)}
              </strong>
              <span className="min-w-0">
                <b className="block truncate text-sm text-foreground">{item.customer_name}</b>
                <small className="block truncate text-[10px] text-foreground-muted">{item.booking_type}</small>
              </span>
              <span className="text-right text-xs text-foreground sm:hidden">
                {money(finance?.amountDue ?? Number(item.final_price ?? 0))}
              </span>
              <span className="col-start-2 min-w-0 truncate text-xs text-foreground-secondary sm:col-start-auto sm:text-sm">
                {item.service_name}
              </span>
              <span className="hidden text-xs text-foreground-muted sm:block">
                {duration(item.start_at, item.end_at)}
              </span>
              <span className="hidden text-sm text-foreground sm:block">
                {money(finance?.amountDue ?? Number(item.final_price ?? 0))}
              </span>
              <span className="hidden text-[9px] uppercase tracking-[.1em] text-foreground-muted sm:block">
                {item.status.replaceAll("_", " ")}
              </span>
            </Link>
          );
        })}
        {!appointments.length ? (
          <div className="px-5 py-7">
            <p className="text-sm text-foreground-secondary">No appointments scheduled today.</p>
            <p className="mt-1 text-xs text-foreground-muted">The day is currently clear.</p>
          </div>
        ) : null}
      </div>
      {slots.length ? (
        <div className="border-t border-border px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-1 text-[9px] uppercase tracking-[.15em] text-foreground-muted">Open slots</p>
            {slots.slice(0, 8).map((slot) => (
              <span key={slot.slot_start} className="border border-border px-2.5 py-1.5 text-[11px] text-foreground-secondary">
                {slot.time}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function RegisterCard({ register }: { register: RegisterSessionDetail | null }) {
  return (
    <aside className="min-w-0 border border-border bg-surface p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[.18em] text-foreground-muted">Register</p>
          <h2 className="mt-1.5 font-admin-display text-2xl uppercase text-foreground">
            {register ? "Open" : "Closed"}
          </h2>
        </div>
        <span className={`border px-2.5 py-1 text-[9px] uppercase tracking-[.14em] ${register ? "border-emerald-500/40 text-emerald-300" : "border-border text-foreground-muted"}`}>
          {register ? "Open" : "Closed"}
        </span>
      </div>
      {register ? (
        <div className="mt-4">
          <p className="text-[9px] uppercase tracking-[.14em] text-foreground-muted">Expected Cash</p>
          <p className="mt-1.5 break-words font-admin-display text-3xl text-accent">
            {money(register.expectedCash)}
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3 text-xs">
            <div>
              <dt className="text-foreground-muted">Opened</dt>
              <dd className="mt-1 text-foreground">{time(register.session.opened_at)}</dd>
            </div>
            <div>
              <dt className="text-foreground-muted">Cash payments</dt>
              <dd className="mt-1 text-foreground">{money(register.breakdown.cashPayments)}</dd>
            </div>
          </dl>
        </div>
      ) : (
        <p className="mt-4 text-sm leading-6 text-foreground-muted">No register is currently open.</p>
      )}
      <Link href="/admin/finance/register" className="mt-4 inline-flex min-h-11 items-center text-[10px] uppercase tracking-[.14em] text-accent sm:min-h-0">
        {register ? "View Register" : "Open Register"} →
      </Link>
    </aside>
  );
}

function RevenuePerformance({
  trend,
  trendRange,
  onRangeChange,
}: {
  trend: FinanceComparison;
  trendRange: "7" | "30";
  onRangeChange: (value: "7" | "30") => void;
}) {
  return (
    <section className="min-w-0 border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[.18em] text-foreground-muted">Revenue Performance</p>
          <p className="mt-1 text-xs leading-5 text-foreground-secondary">Net revenue against the previous equivalent period.</p>
        </div>
        <div className="flex w-fit border border-border">
          {(["7", "30"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onRangeChange(value)}
              className={`min-h-9 px-4 text-[10px] uppercase tracking-[.14em] ${trendRange === value ? "bg-accent text-background" : "text-foreground-muted"}`}
            >
              {value} Days
            </button>
          ))}
        </div>
      </div>
      <ComparisonLine
        current={trend.current.series}
        previous={trend.previous.series}
        metric="revenue"
        formatValue={money}
        periodLabels={[`Current ${trendRange} days`, `Previous ${trendRange} days`]}
      />
    </section>
  );
}

function BusinessSnapshot({
  month,
  topService,
}: {
  month: FinanceComparison["current"]["totals"];
  topService: string;
}) {
  const rows = [
    ["Net revenue", money(month.netRevenue)],
    ["Completed appointments", String(month.completedAppointments)],
    ["Average ticket", money(month.averageTicket)],
    ["Discounts", money(month.discounts)],
    ["Top service", topService],
  ];
  return (
    <aside className="min-w-0 border border-border bg-surface p-4 sm:p-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[.18em] text-foreground-muted">Business Snapshot</p>
          <h2 className="mt-1.5 font-admin-display text-2xl uppercase text-foreground">This Month</h2>
        </div>
        <Link href="/admin/finance" className="inline-flex min-h-11 shrink-0 items-center text-[10px] uppercase tracking-[.13em] text-accent sm:min-h-0">
          View →
        </Link>
      </div>
      <dl className="mt-3 divide-y divide-border">
        {rows.map(([label, value]) => (
          <div key={label} className="flex min-w-0 items-start justify-between gap-3 py-2.5">
            <dt className="min-w-0 text-xs leading-5 text-foreground-muted">{label}</dt>
            <dd className="min-w-0 break-words text-right text-sm leading-5 text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}

function RecentActivity({ activities }: { activities: Array<{ at: string; label: string; context: string }> }) {
  return (
    <section className="min-w-0 border border-border bg-surface p-4 sm:p-5">
      <p className="text-[10px] uppercase tracking-[.18em] text-foreground-muted">Recent Activity</p>
      <div className="mt-2 divide-y divide-border">
        {activities.map((item, index) => (
          <div key={`${item.at}-${index}`} className="min-w-0 py-2.5">
            <p className="break-words text-sm text-foreground">{item.label}</p>
            <p className="mt-0.5 break-words text-[11px] leading-5 text-foreground-muted">
              {item.context} · {fullDate(item.at)} {time(item.at)}
            </p>
          </div>
        ))}
        {!activities.length ? (
          <div className="py-5">
            <p className="text-sm text-foreground-secondary">No recent activity.</p>
            <p className="mt-1 text-xs text-foreground-muted">New bookings and payments will appear here.</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Attention({
  outstandingCount,
  outstandingTotal,
  unsentReceipts,
  tomorrowBookings,
}: {
  outstandingCount: number;
  outstandingTotal: number;
  unsentReceipts: number;
  tomorrowBookings: number;
}) {
  const items = [
    outstandingCount
      ? {
          text: `${outstandingCount} appointment${outstandingCount === 1 ? " has" : "s have"} outstanding payments`,
          detail: `${money(outstandingTotal)} outstanding`,
          href: "/admin/finance",
          action: "Review",
        }
      : null,
    unsentReceipts
      ? {
          text: `${unsentReceipts} receipt${unsentReceipts === 1 ? " has" : "s have"} not been emailed`,
          detail: "Customer delivery pending",
          href: "/admin/finance/receipts",
          action: "Review",
        }
      : null,
    tomorrowBookings > 0 && tomorrowBookings < 3
      ? {
          text: `Tomorrow has only ${tomorrowBookings} booking${tomorrowBookings === 1 ? "" : "s"}`,
          detail: "Review upcoming availability",
          href: "/admin/calendar",
          action: "Calendar",
        }
      : null,
  ].filter(Boolean) as Array<{ text: string; detail: string; href: string; action: string }>;

  return (
    <aside className="min-w-0 border border-border bg-surface p-4 sm:p-5">
      <p className="text-[10px] uppercase tracking-[.18em] text-foreground-muted">Needs Attention</p>
      <div className="mt-2 divide-y divide-border">
        {items.map((item) => (
          <div key={item.text} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-2.5">
            <div className="min-w-0">
              <p className="break-words text-sm leading-5 text-foreground">{item.text}</p>
              <p className="mt-0.5 break-words text-xs leading-5 text-foreground-muted">{item.detail}</p>
            </div>
            <Link href={item.href} className="inline-flex min-h-11 items-center text-[10px] uppercase tracking-[.14em] text-accent sm:min-h-0">
              {item.action} →
            </Link>
          </div>
        ))}
        {!items.length ? (
          <div className="py-5">
            <p className="text-sm text-emerald-300">Everything is up to date.</p>
            <p className="mt-1 text-xs text-foreground-muted">No action is currently required.</p>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function QuickActions() {
  const items = [
    { label: "New Appointment", href: "/admin/appointments?new=1", icon: Plus },
    { label: "Checkout", href: "/admin/appointments", icon: CreditCard },
    { label: "Add Closure", href: "/admin/site-settings/business-hours", icon: CalendarDays },
    { label: "Generate Report", href: "/admin/finance/reports", icon: Receipt },
    { label: "Create Announcement", href: "/admin/site-settings/announcements", icon: Megaphone },
    { label: "Manage Services", href: "/admin/site-settings/services", icon: Scissors },
  ];
  return (
    <section className="min-w-0 border-y border-border py-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <p className="shrink-0 text-[10px] uppercase tracking-[.18em] text-foreground-muted lg:w-28">Quick Actions</p>
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          {items.map(({ label, href, icon: Icon }) => (
            <Link
              key={label}
              href={href}
              className="flex min-h-11 min-w-0 items-center justify-between gap-2 border border-border px-3 text-[9px] uppercase tracking-[.09em] text-foreground-secondary transition-colors hover:border-accent/50 hover:text-accent sm:text-[10px]"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Icon size={14} className="shrink-0" />
                <span className="break-words">{label}</span>
              </span>
              <ArrowRight size={12} className="shrink-0" />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function deltaLabel(value: number | null) {
  if (value === null) return "No previous-day baseline";
  return `${value >= 0 ? "↑" : "↓"} ${Math.abs(value).toFixed(1)}% vs yesterday`;
}

function buildActivity(props: Props) {
  const events: Array<{ at: string; label: string; context: string }> = [];
  props.finance.transactions.forEach((item) =>
    events.push({
      at: item.paid_at,
      label: item.transaction_type === "refund" ? "Refund recorded" : "Payment received",
      context: `${item.customer_name} · ${money(item.amount)}`,
    }),
  );
  props.todayAppointments.forEach((item) =>
    events.push({
      at: item.updated_at,
      label:
        item.status === "cancelled"
          ? "Appointment cancelled"
          : item.status === "completed"
            ? "Appointment completed"
            : "Appointment booked",
      context: `${item.customer_name} · ${item.service_name}`,
    }),
  );
  props.finance.receipts.forEach((item) =>
    events.push({
      at: item.emailed_at ?? item.issued_at,
      label: item.emailed_at ? "Receipt emailed" : "Receipt issued",
      context: `Beleg ${item.receipt_number} · ${item.customer_name ?? "Customer"}`,
    }),
  );
  return events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}
