"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  Clock3,
  Mail,
  MessageCircle,
  Phone,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { updateAdminCustomer, updateAdminCustomerNotes } from "@/app/actions/customers";
import { getZurichDateKeyFromIso } from "@/lib/appointments/date-utils";
import type {
  AdminCustomerAppointment,
  AdminCustomerDirectoryEntry,
  AdminCustomerLoyaltySummary,
} from "@/lib/customers/types";
import {
  formatCustomerStatus,
  getCustomerInsights,
  type CustomerStatus,
} from "@/lib/customers/status";
import { getMarketingConsentStatus } from "@/lib/customers/marketing-consent";
import AdminSelect from "@/components/admin/AdminSelect";
import RecurringBookingManager from "@/components/recurring-bookings/RecurringBookingManager";
import type { RecurringBookingRecord } from "@/lib/recurring-bookings/types";

type Props = {
  customers: AdminCustomerDirectoryEntry[];
  activeServices: { id: string; name: string }[];
  recurringBookings: RecurringBookingRecord[];
  loyaltySummaries: Record<string, AdminCustomerLoyaltySummary>;
  todayIso: string;
};

type CustomerWorkspaceTab = "overview" | "appointments" | "regular" | "activity" | "notes";

type FilterMode = "all" | "registered" | "guest";
type SortMode = "name" | "newest" | "most_visits" | "last_visit" | "next_appointment" | "most_no_shows";
type AppointmentFilter = "all" | "upcoming" | "none";
type RecencyFilter = "all" | "30" | "60" | "90" | "120_plus";
type VisitFilter = "all" | "0_1" | "2_4" | "5_plus";
type NoShowFilter = "all" | "1" | "2" | "3";

type EditFormState = {
  fullName: string;
  email: string;
  phone: string;
};

function toTimestamp(value: string | null | undefined) {
  return value ? new Date(value).getTime() : null;
}

function getNewestTimestamp(customer: AdminCustomerDirectoryEntry) {
  const appointmentCreated = customer.appointment_history
    .map((appointment) => toTimestamp(appointment.start_at) ?? 0)
    .reduce((latest, value) => Math.max(latest, value), 0);
  return Math.max(toTimestamp(customer.created_at) ?? 0, appointmentCreated);
}

function getAppointmentLink(appointment: AdminCustomerAppointment) {
  const dateKey = getZurichDateKeyFromIso(appointment.start_at);
  return `/admin/appointments?view=day&date=${dateKey}&appointmentId=${encodeURIComponent(appointment.id)}`;
}

function getCustomerTypeLabel(type: AdminCustomerDirectoryEntry["type"]) {
  return type === "registered" ? "Registered" : "Guest";
}

function getCustomerMetrics(customer: AdminCustomerDirectoryEntry) {
  return customer.appointment_history.reduce(
    (metrics, appointment) => {
      if (appointment.status === "completed") {
        metrics.visits += 1;
      } else if (appointment.status === "cancelled") {
        metrics.cancellations += 1;
      } else if (appointment.status === "no_show") {
        metrics.noShows += 1;
      }
      return metrics;
    },
    { visits: 0, cancellations: 0, noShows: 0 },
  );
}

function getCustomerStatusDetails(
  customer: AdminCustomerDirectoryEntry,
  nowTimestamp: number,
) {
  return getCustomerInsights(customer, new Date(nowTimestamp));
}

function getCustomerStatistics(customer: AdminCustomerDirectoryEntry, nowTimestamp: number) {
  const appointments = customer.appointment_history
    .slice()
    .sort((first, second) => toTimestamp(second.start_at)! - toTimestamp(first.start_at)!);
  const pastAppointments = appointments.filter(
    (appointment) => (toTimestamp(appointment.end_at) ?? 0) <= nowTimestamp,
  );
  const upcomingAppointments = appointments
    .filter(
      (appointment) =>
        appointment.status === "confirmed" &&
        (toTimestamp(appointment.start_at) ?? 0) > nowTimestamp,
    )
    .sort((first, second) => toTimestamp(first.start_at)! - toTimestamp(second.start_at)!);
  const completedAppointments = pastAppointments.filter(
    (appointment) => appointment.status === "completed",
  );
  const serviceCounts = completedAppointments.reduce<Map<string, number>>((counts, appointment) => {
    counts.set(appointment.service_name, (counts.get(appointment.service_name) ?? 0) + 1);
    return counts;
  }, new Map());
  const favoriteService = Array.from(serviceCounts.entries()).sort(
    ([firstName, firstCount], [secondName, secondCount]) =>
      secondCount - firstCount || firstName.localeCompare(secondName),
  )[0]?.[0] ?? null;

  return {
    totalBookings: appointments.length,
    completedVisits: appointments.filter((appointment) => appointment.status === "completed").length,
    upcomingCount: upcomingAppointments.length,
    cancellations: appointments.filter((appointment) => appointment.status === "cancelled").length,
    noShows: appointments.filter((appointment) => appointment.status === "no_show").length,
    lastVisit: completedAppointments[0] ?? null,
    nextVisit: upcomingAppointments[0] ?? null,
    favoriteService,
    history: pastAppointments,
    upcomingAppointments,
  };
}

function getCustomerStatusClasses(status: CustomerStatus) {
  switch (status) {
    case "regular":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
    case "returning":
      return "border-sky-500/30 bg-sky-500/10 text-sky-200";
    case "at_risk":
      return "border-amber-500/30 bg-amber-500/10 text-amber-200";
    case "inactive":
      return "border-border bg-background/60 text-foreground-muted";
    case "prospect":
      return "border-violet-500/30 bg-violet-500/10 text-violet-200";
    default:
      return "border-accent/40 bg-accent/10 text-accent";
  }
}

function formatStatusLabel(status: string) {
  return status.replace("_", " ");
}

function getStatusClasses(status: string) {
  switch (status) {
    case "completed":
      return "border-sky-500/30 bg-sky-500/10 text-sky-200";
    case "cancelled":
      return "border-rose-500/30 bg-rose-500/10 text-rose-200";
    case "no_show":
      return "border-amber-500/30 bg-amber-500/10 text-amber-200";
    default:
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  }
}

function getDurationLabel(appointment: AdminCustomerAppointment) {
  const minutes = Math.max(
    0,
    Math.round((new Date(appointment.end_at).getTime() - new Date(appointment.start_at).getTime()) / 60000),
  );
  if (minutes >= 60 && minutes % 60 === 0) {
    return `${minutes / 60}h`;
  }
  return `${minutes} min`;
}

function formatActivityDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zurich",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function getCustomerActivity(customer: AdminCustomerDirectoryEntry) {
  const activity = [
    {
      id: `customer-${customer.id}`,
      timestamp: customer.created_at,
      title: "Customer created",
      detail: getCustomerTypeLabel(customer.type),
    },
  ];

  customer.appointment_history.forEach((appointment) => {
    activity.push({
      id: `booked-${appointment.id}`,
      timestamp: appointment.created_at,
      title: "Appointment booked",
      detail: appointment.service_name,
    });

    if (["completed", "cancelled", "no_show"].includes(appointment.status)) {
      activity.push({
        id: `status-${appointment.id}`,
        timestamp: appointment.start_at,
        title:
          appointment.status === "completed"
            ? "Appointment completed"
            : appointment.status === "cancelled"
              ? "Appointment cancelled"
              : "Appointment marked no-show",
        detail: appointment.service_name,
      });
    }
  });

  return activity.sort(
    (first, second) => new Date(second.timestamp).getTime() - new Date(first.timestamp).getTime(),
  );
}

function formatCustomerSince(createdAt: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zurich",
    month: "short",
    year: "numeric",
  }).format(new Date(createdAt));
}

function getCreateAppointmentLink(customer: AdminCustomerDirectoryEntry) {
  if (customer.id.startsWith("legacy-guest:")) {
    return "/admin/appointments?new=1";
  }

  return `/admin/appointments?new=1&customerId=${encodeURIComponent(customer.id)}`;
}

export default function AdminCustomersView({ customers, activeServices, recurringBookings, loyaltySummaries, todayIso }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | CustomerStatus>("all");
  const [appointmentFilter, setAppointmentFilter] = useState<AppointmentFilter>("all");
  const [recencyFilter, setRecencyFilter] = useState<RecencyFilter>("all");
  const [visitFilter, setVisitFilter] = useState<VisitFilter>("all");
  const [noShowFilter, setNoShowFilter] = useState<NoShowFilter>("all");
  const [favoriteServiceFilter, setFavoriteServiceFilter] = useState("all");
  const [sort, setSort] = useState<SortMode>("name");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editFeedback, setEditFeedback] = useState("");
  const [localCustomers, setLocalCustomers] = useState(customers);
  const [editForm, setEditForm] = useState<EditFormState>({
    fullName: "",
    email: "",
    phone: "",
  });
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [notesFeedback, setNotesFeedback] = useState("");
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [workspaceTab, setWorkspaceTab] = useState<CustomerWorkspaceTab>("overview");
  const [isPending, startTransition] = useTransition();
  const [isNotesPending, startNotesTransition] = useTransition();

  const todayTimestamp = useMemo(() => new Date(todayIso).getTime(), [todayIso]);

  const selectedCustomer =
    localCustomers.find((customer) => customer.id === selectedCustomerId) ?? null;
  const selectedStatistics = selectedCustomer
    ? getCustomerStatistics(selectedCustomer, todayTimestamp)
    : null;
  const selectedRecurringBookings = selectedCustomer ? recurringBookings.filter((series) => series.customer_id === selectedCustomer.id) : [];
  const selectedActivity = selectedCustomer ? [
    ...getCustomerActivity(selectedCustomer),
    ...selectedRecurringBookings.flatMap((series) => [
      { id: `series-created-${series.id}`, timestamp: series.created_at, title: "Regular booking created", detail: series.service_name ?? "Service" },
      ...(series.cancelled_at ? [{ id: `series-removed-${series.id}`, timestamp: series.cancelled_at, title: "Regular booking removed", detail: series.service_name ?? "Service" }] : []),
      ...(series.paused_at ? [{ id: `series-paused-${series.id}`, timestamp: series.paused_at, title: "Regular booking paused", detail: series.service_name ?? "Service" }] : []),
    ]),
  ].sort((first, second) => new Date(second.timestamp).getTime() - new Date(first.timestamp).getTime()) : [];
  const selectedStatus = selectedCustomer
    ? getCustomerStatusDetails(selectedCustomer, todayTimestamp)
    : null;
  const selectedLoyalty = selectedCustomer ? loyaltySummaries[selectedCustomer.id] ?? null : null;

  useEffect(() => {
    if (!selectedCustomer) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeCustomer();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedCustomer]);

  const filteredCustomers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const items = localCustomers.filter((customer) => {
      const insights = getCustomerStatusDetails(customer, todayTimestamp);
      if (filter !== "all" && customer.type !== filter) {
        return false;
      }

      if (statusFilter !== "all" && insights.status !== statusFilter) return false;
      if (appointmentFilter === "upcoming" && !insights.nextConfirmedAppointment) return false;
      if (appointmentFilter === "none" && insights.nextConfirmedAppointment) return false;
      if (recencyFilter !== "all") {
        const days = insights.daysSinceLastCompleted;
        if (days === null) return false;
        if (recencyFilter === "120_plus" ? days < 120 : days > Number(recencyFilter)) return false;
      }
      if (visitFilter === "0_1" && insights.completedVisits > 1) return false;
      if (visitFilter === "2_4" && (insights.completedVisits < 2 || insights.completedVisits > 4)) return false;
      if (visitFilter === "5_plus" && insights.completedVisits < 5) return false;
      if (noShowFilter !== "all" && insights.noShows < Number(noShowFilter)) return false;
      if (favoriteServiceFilter !== "all" && insights.favoriteService !== favoriteServiceFilter) return false;

      if (!normalizedQuery) {
        return true;
      }

      const haystack = [customer.full_name, customer.email, customer.phone]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });

    items.sort((first, second) => {
      switch (sort) {
        case "newest":
          return getNewestTimestamp(second) - getNewestTimestamp(first);
        case "most_visits":
          return getCustomerStatusDetails(second, todayTimestamp).completedVisits - getCustomerStatusDetails(first, todayTimestamp).completedVisits;
        case "most_no_shows":
          return getCustomerStatusDetails(second, todayTimestamp).noShows - getCustomerStatusDetails(first, todayTimestamp).noShows;
        case "last_visit": {
          const firstTime = toTimestamp(first.last_appointment?.start_at) ?? -Infinity;
          const secondTime = toTimestamp(second.last_appointment?.start_at) ?? -Infinity;
          return secondTime - firstTime;
        }
        case "next_appointment": {
          const firstTime = toTimestamp(first.upcoming_appointment?.start_at) ?? Infinity;
          const secondTime = toTimestamp(second.upcoming_appointment?.start_at) ?? Infinity;
          if (firstTime !== secondTime) {
            return firstTime - secondTime;
          }
          return first.full_name.localeCompare(second.full_name);
        }
        default:
          return first.full_name.localeCompare(second.full_name);
      }
    });

    return items;
  }, [appointmentFilter, favoriteServiceFilter, filter, localCustomers, noShowFilter, query, recencyFilter, sort, statusFilter, todayTimestamp, visitFilter]);

  const activeFilterChips = [
    filter !== "all" ? { key: "type", label: getCustomerTypeLabel(filter), clear: () => setFilter("all") } : null,
    statusFilter !== "all" ? { key: "status", label: formatCustomerStatus(statusFilter), clear: () => setStatusFilter("all") } : null,
    appointmentFilter !== "all" ? { key: "appointment", label: appointmentFilter === "upcoming" ? "Has Upcoming" : "No Upcoming", clear: () => setAppointmentFilter("all") } : null,
    recencyFilter !== "all" ? { key: "recency", label: recencyFilter === "120_plus" ? "120+ Days" : `Last ${recencyFilter} Days`, clear: () => setRecencyFilter("all") } : null,
    visitFilter !== "all" ? { key: "visits", label: `${visitFilter.replace("_", "-").replace("plus", "+")} Visits`, clear: () => setVisitFilter("all") } : null,
    noShowFilter !== "all" ? { key: "no-shows", label: `${noShowFilter}+ No-Shows`, clear: () => setNoShowFilter("all") } : null,
    favoriteServiceFilter !== "all" ? { key: "service", label: favoriteServiceFilter, clear: () => setFavoriteServiceFilter("all") } : null,
  ].filter((chip): chip is { key: string; label: string; clear: () => void } => Boolean(chip));

  function clearAllFilters() {
    setFilter("all");
    setStatusFilter("all");
    setAppointmentFilter("all");
    setRecencyFilter("all");
    setVisitFilter("all");
    setNoShowFilter("all");
    setFavoriteServiceFilter("all");
  }

  const summary = useMemo(() => {
    const monthPrefix = getZurichDateKeyFromIso(todayIso).slice(0, 7);
    const totalCustomers = filteredCustomers.length;
    const withUpcoming = filteredCustomers.filter((customer) => {
      const timestamp = toTimestamp(customer.upcoming_appointment?.end_at);
      return timestamp !== null && timestamp >= todayTimestamp;
    }).length;
    const newThisMonth = filteredCustomers.filter((customer) =>
      customer.created_at.slice(0, 7) === monthPrefix,
    ).length;

    return {
      totalCustomers,
      withUpcoming,
      newThisMonth,
    };
  }, [filteredCustomers, todayIso, todayTimestamp]);

  function openCustomer(customer: AdminCustomerDirectoryEntry) {
    setSelectedCustomerId(customer.id);
    setIsEditing(false);
    setEditFeedback("");
    setIsEditingNotes(false);
    setNotesDraft(customer.notes ?? "");
    setNotesFeedback("");
    setIsActionsOpen(false);
    setShowAllHistory(false);
    setWorkspaceTab("overview");
    setEditForm({
      fullName: customer.full_name,
      email: customer.email,
      phone: customer.phone,
    });
  }

  function closeCustomer() {
    setSelectedCustomerId(null);
    setIsEditing(false);
    setEditFeedback("");
    setIsEditingNotes(false);
    setNotesFeedback("");
    setIsActionsOpen(false);
  }

  function saveCustomer() {
    if (!selectedCustomer || selectedCustomer.id.startsWith("legacy-guest:")) {
      return;
    }

    startTransition(async () => {
      setEditFeedback("");
      const result = await updateAdminCustomer({
        customerId: selectedCustomer.id,
        fullName: editForm.fullName,
        email: editForm.email,
        phone: editForm.phone,
        notes: selectedCustomer.notes ?? "",
      });

      if (result.error) {
        setEditFeedback(result.error);
        return;
      }

      setLocalCustomers((current) =>
        current.map((customer) =>
          customer.id === selectedCustomer.id
            ? {
                ...customer,
                full_name: editForm.fullName.trim(),
                email: editForm.email.trim().toLowerCase(),
                phone: editForm.phone.trim(),
              }
            : customer,
        ),
      );
      setEditFeedback("Customer saved.");
      setIsEditing(false);
      router.refresh();
    });
  }

  function saveNotes() {
    if (!selectedCustomer || selectedCustomer.id.startsWith("legacy-guest:")) {
      return;
    }

    startNotesTransition(async () => {
      setNotesFeedback("");
      const result = await updateAdminCustomerNotes({
        customerId: selectedCustomer.id,
        notes: notesDraft,
      });

      if (result.error) {
        setNotesFeedback(result.error);
        return;
      }

      const notes = notesDraft.trim() || null;
      setLocalCustomers((current) =>
        current.map((customer) =>
          customer.id === selectedCustomer.id ? { ...customer, notes } : customer,
        ),
      );
      setIsEditingNotes(false);
      setNotesFeedback("Notes saved.");
      router.refresh();
    });
  }

  return (
    <section className="space-y-8">
      <div className="space-y-4">
        <p className="font-admin-primary text-xs uppercase tracking-[0.34em] text-foreground-secondary">
          Customers
        </p>
        <div className="space-y-2">
          <h1 className="font-admin-display text-[clamp(2.2rem,5vw,4.25rem)] font-semibold uppercase leading-[0.95] tracking-[-0.04em] text-foreground">
            Customers
          </h1>
          <p className="max-w-3xl font-admin-primary text-sm leading-7 text-foreground-secondary sm:text-base">
            A CRM-style view of registered customers and guest bookers with visit history, upcoming
            appointments, and quick admin actions.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
        {[
          ["Total Customers", summary.totalCustomers],
          ["Upcoming Appointments", summary.withUpcoming],
          ["New This Month", summary.newThisMonth],
        ].map(([label, value]) => (
          <div
            key={label}
            className="border border-border bg-surface px-4 py-4 sm:px-5 sm:py-5 last:sm:col-span-2 last:lg:col-span-1"
          >
            <p className="font-admin-primary text-[11px] uppercase tracking-[0.2em] text-foreground-muted">
              {label}
            </p>
            <p className="mt-2 font-admin-display text-3xl uppercase tracking-[-0.04em] text-foreground sm:mt-3 sm:text-4xl">
              {value}
            </p>
          </div>
        ))}
      </div>

      <div className="relative border border-border bg-surface p-3 sm:p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="w-full space-y-2 lg:min-w-[280px] lg:flex-1">
            <span className="font-admin-primary text-[11px] uppercase tracking-[0.2em] text-foreground-muted">
              Search
            </span>
            <div className="flex items-center gap-3 border border-border bg-background px-4 py-2.5">
              <Search size={16} className="text-foreground-muted" />
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Name, email, or phone"
                className="w-full bg-transparent font-admin-primary text-sm text-foreground outline-none placeholder:text-foreground-muted"
              />
            </div>
          </label>

          <div className="hidden min-w-0 flex-1 space-y-2 sm:block sm:min-w-[290px] lg:max-w-[360px]">
            <span className="inline-flex items-center gap-2 font-admin-primary text-[11px] uppercase tracking-[0.2em] text-foreground-muted">
              <SlidersHorizontal size={12} /> Filter
            </span>
            <div className="inline-flex w-full border border-border bg-background p-1">
              {(["all", "registered", "guest"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setFilter(mode)}
                  className={`min-w-0 flex-1 px-3 py-2.5 font-admin-primary text-[11px] uppercase tracking-[0.14em] transition-colors sm:px-4 sm:text-xs sm:tracking-[0.18em] ${
                    filter === mode
                      ? "bg-accent text-background"
                      : "text-foreground-secondary hover:bg-surface hover:text-foreground"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <AdminSelect label="Sort" value={sort} onChange={(value) => setSort(value as SortMode)} className="min-w-[160px] flex-1 sm:flex-none sm:basis-[210px]" options={[{ value: "name", label: "Name" }, { value: "newest", label: "Newest" }, { value: "most_visits", label: "Most visits" }, { value: "last_visit", label: "Last visit" }, { value: "next_appointment", label: "Next appointment" }, { value: "most_no_shows", label: "Most no-shows" }]} />

          <button type="button" onClick={() => setIsFilterOpen(true)} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 border border-border px-4 font-admin-primary text-[11px] uppercase tracking-[0.16em] text-foreground-secondary transition-colors hover:bg-background hover:text-foreground sm:flex-none"><SlidersHorizontal size={14} /> Filters{activeFilterChips.length ? ` (${activeFilterChips.length})` : ""}</button>
          <div className="relative flex-1 sm:flex-none">
            <button type="button" onClick={() => setIsExportOpen((current) => !current)} className="inline-flex min-h-11 w-full items-center justify-center gap-2 border border-accent/40 bg-accent/10 px-4 font-admin-primary text-[11px] uppercase tracking-[0.16em] text-accent transition-colors hover:bg-accent hover:text-background">Export All <ChevronDown size={14} /></button>
            {isExportOpen ? <div className="absolute right-0 top-full z-30 mt-2 w-full min-w-48 border border-border bg-background-secondary p-2 shadow-xl"><a href="/api/admin/customers/export?format=csv" onClick={() => setIsExportOpen(false)} className="flex min-h-11 items-center px-3 font-admin-primary text-xs uppercase tracking-[0.15em] text-foreground-secondary hover:bg-surface hover:text-foreground">Export CSV</a><a href="/api/admin/customers/export?format=pdf" onClick={() => setIsExportOpen(false)} className="flex min-h-11 items-center px-3 font-admin-primary text-xs uppercase tracking-[0.15em] text-foreground-secondary hover:bg-surface hover:text-foreground">Export PDF</a></div> : null}
          </div>
        </div>

        {activeFilterChips.length ? <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">{activeFilterChips.map((chip) => <button key={chip.key} type="button" onClick={chip.clear} className="inline-flex min-h-9 items-center gap-2 border border-accent/30 bg-accent/10 px-3 font-admin-primary text-[10px] uppercase tracking-[0.13em] text-accent">{chip.label}<X size={12} /></button>)}<button type="button" onClick={clearAllFilters} className="inline-flex min-h-9 items-center px-3 font-admin-primary text-[10px] uppercase tracking-[0.14em] text-foreground-muted hover:text-foreground">Clear all</button></div> : null}

        {isFilterOpen ? <div className="fixed inset-0 z-[100] flex items-end bg-background/80 backdrop-blur-sm sm:absolute sm:inset-auto sm:right-4 sm:top-full sm:mt-2 sm:block sm:w-[620px] sm:max-w-[calc(100vw-2rem)] sm:bg-transparent sm:backdrop-blur-none"><button type="button" className="absolute inset-0 sm:hidden" onClick={() => setIsFilterOpen(false)} aria-label="Close filters" /><div className="relative z-10 max-h-[88dvh] w-full overflow-y-auto border border-border bg-background-secondary p-4 shadow-2xl sm:max-h-[75vh] sm:p-5"><div className="flex items-center justify-between"><p className="font-admin-primary text-xs uppercase tracking-[0.2em] text-foreground">Advanced Filters</p><button type="button" onClick={() => setIsFilterOpen(false)} className="inline-flex h-10 w-10 items-center justify-center border border-border text-foreground-secondary"><X size={15} /></button></div><div className="mt-5 grid gap-4 sm:grid-cols-2">
          <AdminSelect label="Type" value={filter} onChange={(value) => setFilter(value as FilterMode)} options={[{ value: "all", label: "All" }, { value: "registered", label: "Registered" }, { value: "guest", label: "Guest" }]} />
          <AdminSelect label="Status" value={statusFilter} onChange={(value) => setStatusFilter(value as "all" | CustomerStatus)} options={[{ value: "all", label: "All" }, ...(["prospect", "new", "returning", "regular", "at_risk", "inactive"] as CustomerStatus[]).map((status) => ({ value: status, label: formatCustomerStatus(status) }))]} />
          <AdminSelect label="Appointment" value={appointmentFilter} onChange={(value) => setAppointmentFilter(value as AppointmentFilter)} options={[{ value: "all", label: "All" }, { value: "upcoming", label: "Has Upcoming" }, { value: "none", label: "No Upcoming" }]} />
          <AdminSelect label="Visit Recency" value={recencyFilter} onChange={(value) => setRecencyFilter(value as RecencyFilter)} options={[{ value: "all", label: "All" }, { value: "30", label: "Last 30 days" }, { value: "60", label: "Last 60 days" }, { value: "90", label: "Last 90 days" }, { value: "120_plus", label: "120+ days inactive" }]} />
          <AdminSelect label="Completed Visits" value={visitFilter} onChange={(value) => setVisitFilter(value as VisitFilter)} options={[{ value: "all", label: "All" }, { value: "0_1", label: "0-1" }, { value: "2_4", label: "2-4" }, { value: "5_plus", label: "5+" }]} />
          <AdminSelect label="No-Shows" value={noShowFilter} onChange={(value) => setNoShowFilter(value as NoShowFilter)} options={[{ value: "all", label: "All" }, { value: "1", label: "1+" }, { value: "2", label: "2+" }, { value: "3", label: "3+" }]} />
          <AdminSelect label="Favorite Service" value={favoriteServiceFilter} onChange={setFavoriteServiceFilter} options={[{ value: "all", label: "All active services" }, ...activeServices.map((service) => ({ value: service.name, label: service.name }))]} searchable={activeServices.length > 8} className="sm:col-span-2" />
        </div><div className="mt-5 flex gap-3"><button type="button" onClick={() => setIsFilterOpen(false)} className="inline-flex min-h-11 flex-1 items-center justify-center bg-accent px-4 font-admin-primary text-xs uppercase tracking-[0.16em] text-background">Show {filteredCustomers.length} Customers</button><button type="button" onClick={clearAllFilters} className="inline-flex min-h-11 items-center justify-center border border-border px-4 font-admin-primary text-xs uppercase tracking-[0.16em] text-foreground-secondary">Clear</button></div></div></div> : null}
      </div>

      <div className="border border-border bg-surface">
        <div className="hidden grid-cols-[minmax(220px,1.5fr)_100px_80px_minmax(130px,0.8fr)_minmax(190px,1fr)] gap-4 border-b border-border px-6 py-4 xl:grid">
          {["Customer", "Type", "Visits", "Last Visit", "Next Appointment"].map(
            (label) => (
              <p key={label} className="font-admin-primary text-[11px] uppercase tracking-[0.2em] text-foreground-muted">
                {label}
              </p>
            ),
          )}
        </div>

        <div className="hidden divide-y divide-border xl:block">
          {filteredCustomers.map((customer) => {
            const customerStatus = getCustomerStatusDetails(customer, todayTimestamp);
            return (
            <button
              key={customer.id}
              type="button"
              onClick={() => openCustomer(customer)}
              className="group grid w-full grid-cols-[minmax(220px,1.5fr)_100px_80px_minmax(130px,0.8fr)_minmax(190px,1fr)] items-center gap-4 px-6 py-5 text-left transition-colors hover:bg-background/55 focus-visible:bg-background/55 focus-visible:outline-none"
            >
              <div className="min-w-0">
                <p className="font-admin-display text-xl uppercase tracking-[-0.04em] text-foreground transition-colors group-hover:text-accent">
                  {customer.full_name}
                </p>
                <div className="mt-2 space-y-1">
                  <p className="break-words font-admin-primary text-sm text-foreground-secondary">{customer.email || "No email"}</p>
                  <p className="font-admin-primary text-sm text-foreground-muted">{customer.phone || "No phone"}</p>
                </div>
              </div>
              <div className="flex flex-col items-start gap-2"><span className="inline-flex border border-border bg-background/50 px-3 py-2 font-admin-primary text-[11px] uppercase tracking-[0.18em] text-foreground-secondary">{getCustomerTypeLabel(customer.type)}</span><span className={`inline-flex border px-2 py-1 font-admin-primary text-[9px] uppercase tracking-[0.14em] ${getCustomerStatusClasses(customerStatus.status)}`}>{formatCustomerStatus(customerStatus.status)}</span></div>
              <div><span className="inline-flex min-w-9 items-center justify-center border border-border bg-background/50 px-2 py-1.5 font-admin-primary text-xs text-foreground-secondary">{getCustomerMetrics(customer).visits}</span></div>
              <div>
                <p className="font-admin-primary text-sm text-foreground-secondary">{customer.last_appointment?.date_label || "—"}</p>
                {customer.last_appointment ? <p className="mt-1 font-admin-primary text-xs leading-5 text-foreground-muted">{customer.last_appointment.service_name}</p> : null}
              </div>
              <div className="flex min-h-16 items-center justify-between gap-3 border border-accent/30 bg-accent/[0.06] px-3 py-2.5">
                <div className="min-w-0">
                  <p className="font-admin-primary text-sm text-foreground">{customer.upcoming_appointment?.date_label || "No upcoming"}</p>
                  {customer.upcoming_appointment ? <p className="mt-1 font-admin-primary text-xs leading-5 text-foreground-secondary">{customer.upcoming_appointment.time_label} · {customer.upcoming_appointment.service_name}</p> : null}
                </div>
                <ChevronRight size={16} className="shrink-0 text-foreground-muted transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </div>
            </button>
            );
          })}
        </div>

        <div className="grid gap-3 p-3 xl:hidden sm:p-4">
          {filteredCustomers.map((customer) => {
            const customerStatus = getCustomerStatusDetails(customer, todayTimestamp);
            return (
            <button key={customer.id} type="button" onClick={() => openCustomer(customer)} className="w-full border border-border bg-background/35 p-4 text-left transition-colors hover:bg-background/60 focus-visible:bg-background/60 focus-visible:outline-none">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="break-words font-admin-display text-xl uppercase tracking-[-0.04em] text-foreground">{customer.full_name}</p>
                  <p className="mt-2 break-all font-admin-primary text-sm text-foreground-secondary">{customer.email || "No email"}</p>
                  <p className="mt-1 font-admin-primary text-sm text-foreground-secondary">{customer.phone || "No phone"}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2"><span className="border border-border bg-surface px-2.5 py-1.5 font-admin-primary text-[10px] uppercase tracking-[0.16em] text-foreground-secondary">{getCustomerTypeLabel(customer.type)}</span><span className={`border px-2 py-1 font-admin-primary text-[9px] uppercase tracking-[0.13em] ${getCustomerStatusClasses(customerStatus.status)}`}>{formatCustomerStatus(customerStatus.status)}</span></div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3">
                <div>
                  <p className="font-admin-primary text-[10px] uppercase tracking-[0.16em] text-foreground-muted">Visits</p>
                  <span className="mt-2 inline-flex min-w-9 items-center justify-center border border-border bg-surface px-2 py-1 font-admin-primary text-xs text-foreground-secondary">{getCustomerMetrics(customer).visits}</span>
                </div>
                <div className="border-l-2 border-accent/70 pl-3">
                  <p className="font-admin-primary text-[10px] uppercase tracking-[0.16em] text-foreground-muted">Next Appointment</p>
                  <p className="mt-2 font-admin-primary text-sm text-foreground">{customer.upcoming_appointment?.date_label || "No upcoming appointment"}</p>
                  {customer.upcoming_appointment ? <p className="mt-1 font-admin-primary text-xs leading-5 text-foreground-secondary">{customer.upcoming_appointment.time_label} · {customer.upcoming_appointment.service_name}</p> : null}
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between gap-4">
                <p className="font-admin-primary text-xs text-foreground-muted">Last visit: {customer.last_appointment?.date_label || "—"}</p>
                <span className="inline-flex items-center gap-1 font-admin-primary text-[10px] uppercase tracking-[0.16em] text-foreground-secondary">Details <ChevronRight size={14} /></span>
              </div>
            </button>
            );
          })}
        </div>

        {filteredCustomers.length === 0 ? <div className="px-5 py-12 text-center"><p className="font-admin-primary text-sm text-foreground-secondary">No customers match the current search and filters.</p></div> : null}
      </div>

      {selectedCustomer ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-background/85 p-0 backdrop-blur-md sm:p-4">
          <button type="button" className="absolute inset-0 cursor-default" aria-label="Close customer details" onClick={closeCustomer} />
          <section className="relative z-10 flex h-[100dvh] w-full flex-col overflow-hidden border-border bg-surface shadow-2xl sm:h-[94dvh] sm:w-[94vw] sm:max-w-[1500px] sm:border" role="dialog" aria-modal="true" aria-label={`Customer details for ${selectedCustomer.full_name}`}>
            <header className="shrink-0 border-b border-border bg-surface/95 px-4 py-4 backdrop-blur-sm sm:px-6 lg:px-8 lg:py-5">
              <div className="flex flex-col gap-4 pr-12 lg:flex-row lg:items-center lg:justify-between lg:pr-0">
                <div className="min-w-0">
                  <p className="font-admin-primary text-[10px] uppercase tracking-[0.28em] text-foreground-muted">Customer</p>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <h2 className="break-words font-admin-display text-2xl uppercase tracking-[-0.04em] text-foreground sm:text-3xl lg:text-4xl">{selectedCustomer.full_name}</h2>
                    <span className="inline-flex border border-accent/40 bg-accent/10 px-2.5 py-1.5 font-admin-primary text-[10px] uppercase tracking-[0.16em] text-accent">{getCustomerTypeLabel(selectedCustomer.type)}</span>
                    {selectedStatus ? <span className={`inline-flex border px-2.5 py-1.5 font-admin-primary text-[10px] uppercase tracking-[0.16em] ${getCustomerStatusClasses(selectedStatus.status)}`}>{formatCustomerStatus(selectedStatus.status)}</span> : null}
                    {(selectedStatistics?.noShows ?? 0) >= 3 ? <span className="inline-flex border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 font-admin-primary text-[10px] uppercase tracking-[0.16em] text-amber-200">{selectedStatistics?.noShows} No-Shows</span> : null}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-admin-primary text-xs text-foreground-muted">
                    <span>Customer since {formatCustomerSince(selectedCustomer.created_at)}</span>
                    <span>Last completed: {selectedStatus?.lastCompletedAppointment?.date_label ?? "—"}</span>
                    <span>{selectedStatus?.completedVisits ?? 0} completed visits</span>
                    {selectedStatus?.daysSinceLastCompleted !== null && selectedStatus?.daysSinceLastCompleted !== undefined ? <span>{selectedStatus.daysSinceLastCompleted} days since last completed visit</span> : null}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Link href={getCreateAppointmentLink(selectedCustomer)} className="inline-flex min-h-11 flex-1 items-center justify-center border border-border bg-accent px-4 font-admin-primary text-xs uppercase tracking-[0.17em] text-background transition-colors hover:bg-accent-hover sm:flex-none">+ Create Appointment</Link>
                  <div className="relative">
                      <button type="button" onClick={() => setIsActionsOpen((current) => !current)} className="inline-flex min-h-11 items-center justify-center gap-2 border border-border px-4 font-admin-primary text-xs uppercase tracking-[0.17em] text-foreground-secondary transition-colors hover:bg-background hover:text-foreground">Actions <ChevronDown size={14} /></button>
                      {isActionsOpen ? (
                        <div className="absolute right-0 top-full z-20 mt-2 w-52 border border-border bg-background-secondary p-2 shadow-xl">
                          {!selectedCustomer.id.startsWith("legacy-guest:") ? <><button type="button" onClick={() => { setIsEditing((current) => !current); setIsActionsOpen(false); }} className="flex min-h-11 w-full items-center px-3 text-left font-admin-primary text-xs uppercase tracking-[0.16em] text-foreground-secondary transition-colors hover:bg-surface hover:text-foreground">Edit Customer</button><button type="button" onClick={() => { setIsEditingNotes(true); setIsActionsOpen(false); setNotesFeedback(""); }} className="flex min-h-11 w-full items-center px-3 text-left font-admin-primary text-xs uppercase tracking-[0.16em] text-foreground-secondary transition-colors hover:bg-surface hover:text-foreground">Edit Notes</button><div className="my-1 border-t border-border" /></> : null}
                          <a href={`/api/admin/customers/export?format=csv&customerId=${encodeURIComponent(selectedCustomer.id)}`} className="flex min-h-11 items-center px-3 font-admin-primary text-xs uppercase tracking-[0.16em] text-foreground-secondary transition-colors hover:bg-surface hover:text-foreground">Export CSV</a>
                          <a href={`/api/admin/customers/export?format=pdf&customerId=${encodeURIComponent(selectedCustomer.id)}`} className="flex min-h-11 items-center px-3 font-admin-primary text-xs uppercase tracking-[0.16em] text-foreground-secondary transition-colors hover:bg-surface hover:text-foreground">Export PDF</a>
                        </div>
                      ) : null}
                  </div>
                </div>
              </div>
              <button type="button" onClick={closeCustomer} className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center border border-border text-foreground-secondary transition-colors hover:bg-background hover:text-foreground sm:right-6 lg:right-8 lg:top-5" aria-label="Close customer details"><X size={17} /></button>
            </header>

            <nav className="shrink-0 overflow-x-auto border-b border-border bg-surface px-4 sm:px-6 lg:px-8" aria-label="Customer workspace">
              <div className="flex min-w-max gap-7">
                {([['overview','Overview'],['appointments','Appointments'],['regular','Regular Booking'],['activity','Activity'],['notes','Notes']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setWorkspaceTab(value)} className={`min-h-12 border-b-2 font-admin-primary text-[10px] uppercase tracking-[0.18em] transition-colors ${workspaceTab === value ? "border-accent text-accent" : "border-transparent text-foreground-muted hover:text-foreground"}`}>{label}</button>)}
              </div>
            </nav>

            <div className="admin-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 pb-[max(20px,env(safe-area-inset-bottom))] sm:px-6 lg:px-8 lg:py-7">
              {workspaceTab === "overview" ? <div className="grid gap-4 lg:grid-cols-2">
                <section className="border border-border bg-background/35 p-4 sm:p-5">
                  <p className="font-admin-primary text-[10px] uppercase tracking-[0.2em] text-foreground-muted">Contact</p>
                  <div className="mt-4 space-y-3"><p className="break-all font-admin-primary text-sm text-foreground">{selectedCustomer.email || "No email"}</p><p className="font-admin-primary text-sm text-foreground">{selectedCustomer.phone || "No phone"}</p></div>
                  <div className="mt-5 grid gap-2 sm:grid-cols-3">{selectedCustomer.email ? <a href={`mailto:${selectedCustomer.email}`} className="inline-flex min-h-11 items-center justify-center gap-2 border border-border text-[10px] uppercase tracking-[.15em]"><Mail size={14}/>Email</a> : null}{selectedCustomer.phone ? <a href={`tel:${selectedCustomer.phone}`} className="inline-flex min-h-11 items-center justify-center gap-2 border border-border text-[10px] uppercase tracking-[.15em]"><Phone size={14}/>Call</a> : null}{selectedCustomer.phone ? <a href={`https://wa.me/${selectedCustomer.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 border border-border text-[10px] uppercase tracking-[.15em] text-emerald-300"><MessageCircle size={14}/>WhatsApp</a> : null}</div>
                  {isEditing && !selectedCustomer.id.startsWith("legacy-guest:") ? <div className="mt-5 space-y-3 border-t border-border pt-5"><label className="block space-y-2"><span className="text-[10px] uppercase tracking-[.16em] text-foreground-muted">Full Name</span><input value={editForm.fullName} onChange={(event) => setEditForm((current) => ({...current, fullName:event.target.value}))} className="min-h-12 w-full border border-border bg-background px-4 text-base text-foreground outline-none sm:text-sm"/></label><label className="block space-y-2"><span className="text-[10px] uppercase tracking-[.16em] text-foreground-muted">Email</span><input type="email" value={editForm.email} onChange={(event) => setEditForm((current) => ({...current, email:event.target.value}))} className="min-h-12 w-full border border-border bg-background px-4 text-base text-foreground outline-none sm:text-sm"/></label><label className="block space-y-2"><span className="text-[10px] uppercase tracking-[.16em] text-foreground-muted">Phone</span><input value={editForm.phone} onChange={(event) => setEditForm((current) => ({...current, phone:event.target.value}))} placeholder="Phone (Optional)" className="min-h-12 w-full border border-border bg-background px-4 text-base text-foreground outline-none sm:text-sm"/></label>{editFeedback ? <p className="text-sm text-foreground-secondary">{editFeedback}</p> : null}<div className="flex gap-2"><button onClick={saveCustomer} disabled={isPending} className="min-h-11 flex-1 bg-accent px-4 text-xs uppercase text-background">{isPending ? "Saving..." : "Save"}</button><button onClick={() => setIsEditing(false)} className="min-h-11 border border-border px-4 text-xs uppercase">Cancel</button></div></div> : null}
                </section>
                <section className="border border-border bg-background/35 p-4 sm:p-5"><p className="text-[10px] uppercase tracking-[.2em] text-foreground-muted">Customer Statistics</p><div className="mt-4 grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-5">{[["Bookings",selectedStatistics?.totalBookings ?? 0],["Completed",selectedStatistics?.completedVisits ?? 0],["Upcoming",selectedStatistics?.upcomingCount ?? 0],["Cancelled",selectedStatistics?.cancellations ?? 0],["No Shows",selectedStatistics?.noShows ?? 0]].map(([label,value]) => <div key={label} className="bg-surface p-3"><p className="text-[9px] uppercase tracking-[.12em] text-foreground-muted">{label}</p><p className="mt-2 font-admin-display text-2xl">{value}</p></div>)}</div><div className="mt-4 grid gap-3 sm:grid-cols-3">{[["Last Visit",selectedStatistics?.lastVisit?.date_label ?? "—"],["Next Visit",selectedStatistics?.nextVisit ? `${selectedStatistics.nextVisit.date_label} · ${selectedStatistics.nextVisit.time_label}` : "—"],["Favorite Service",selectedStatistics?.favoriteService ?? "—"]].map(([label,value]) => <div key={label} className="border-t border-border pt-3"><p className="text-[9px] uppercase tracking-[.14em] text-foreground-muted">{label}</p><p className="mt-2 break-words text-sm">{value}</p></div>)}</div></section>
                <section className="border border-border bg-background/35 p-4 sm:p-5"><p className="text-[10px] uppercase tracking-[.2em] text-foreground-muted">Loyalty</p>{selectedLoyalty?.is_enabled ? <><div className="mt-4 flex items-end justify-between gap-4"><p className="font-admin-display text-3xl">{selectedLoyalty.eligible_visits} / {selectedLoyalty.visits_required}</p><p className="text-xs text-foreground-muted">{selectedLoyalty.visits_remaining} visits remaining</p></div><div className="mt-3 h-1 bg-border"><div className="h-full bg-accent" style={{width:`${selectedLoyalty.progress_percent}%`}}/></div>{selectedLoyalty.available_reward ? <p className="mt-4 border-l border-accent pl-3 text-sm uppercase text-accent">Reward available · {selectedLoyalty.available_reward.reward_type === "free_service" ? "Free service" : selectedLoyalty.available_reward.reward_type === "percentage" ? `${selectedLoyalty.available_reward.reward_value}% off` : `CHF ${selectedLoyalty.available_reward.reward_value?.toFixed(2)} off`}</p> : null}</> : <p className="mt-4 text-sm text-foreground-muted">Loyalty program is not active.</p>}</section>
                <section className="border border-border bg-background/35 p-4 sm:p-5"><p className="text-[10px] uppercase tracking-[.2em] text-foreground-muted">Marketing</p>{(() => { const status = getMarketingConsentStatus(selectedCustomer); return <><span className={`mt-4 inline-flex border px-3 py-2 text-[10px] uppercase tracking-[.16em] ${status === "subscribed" ? "border-emerald-500/30 text-emerald-200" : "border-border text-foreground-muted"}`}>{status.replace("_"," ")}</span><p className="mt-3 text-xs text-foreground-muted">Customer consent is read-only from this workspace.</p></>; })()}</section>
              </div> : null}

              {workspaceTab === "appointments" ? <div className="space-y-7"><section><div className="flex items-center justify-between border-b border-border pb-3"><p className="text-[10px] uppercase tracking-[.2em] text-foreground-muted">Upcoming Appointments</p><span className="text-xs text-accent">{selectedStatistics?.upcomingCount ?? 0}</span></div><div className="divide-y divide-border">{selectedStatistics?.upcomingAppointments.map((appointment) => <Link key={appointment.id} href={getAppointmentLink(appointment)} className="group grid min-h-16 gap-2 py-4 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-center"><p className="text-sm">{appointment.date_label} · {appointment.time_label}</p><p className="text-sm text-foreground-secondary">{appointment.service_name}</p><span className={`w-fit border px-2 py-1 text-[9px] uppercase ${getStatusClasses(appointment.status)}`}>{formatStatusLabel(appointment.status)}</span><ChevronRight size={15} className="hidden text-foreground-muted sm:block"/></Link>)}{!selectedStatistics?.upcomingCount ? <p className="py-8 text-sm text-foreground-muted">No upcoming appointments.</p> : null}</div></section><section><div className="flex items-center justify-between border-b border-border pb-3"><p className="text-[10px] uppercase tracking-[.2em] text-foreground-muted">Appointment History</p><span className="text-xs text-foreground-muted">{selectedStatistics?.history.length ?? 0}</span></div><div className="divide-y divide-border">{(showAllHistory ? selectedStatistics?.history : selectedStatistics?.history.slice(0,8))?.map((appointment) => <Link key={appointment.id} href={getAppointmentLink(appointment)} className="group grid min-h-16 gap-2 py-4 sm:grid-cols-[1fr_1fr_auto_auto_auto] sm:items-center"><p className="text-sm">{appointment.date_label} · {appointment.time_label}</p><p className="text-sm text-foreground-secondary">{appointment.service_name}</p><span className={`w-fit border px-2 py-1 text-[9px] uppercase ${getStatusClasses(appointment.status)}`}>{formatStatusLabel(appointment.status)}</span><span className="text-xs text-foreground-muted">{getDurationLabel(appointment)}</span><ChevronRight size={15} className="hidden text-foreground-muted sm:block"/></Link>)}{!selectedStatistics?.history.length ? <p className="py-8 text-sm text-foreground-muted">No appointment history yet.</p> : null}</div>{(selectedStatistics?.history.length ?? 0) > 8 ? <button onClick={() => setShowAllHistory((value) => !value)} className="mt-4 min-h-11 border border-border px-4 text-[10px] uppercase tracking-[.16em]">{showAllHistory ? "Show Recent" : "View Full History"}</button> : null}</section></div> : null}

              {workspaceTab === "regular" ? <RecurringBookingManager mode="admin" services={activeServices} customers={selectedCustomer.id.startsWith("legacy-guest:") ? [] : [{id:selectedCustomer.id,full_name:selectedCustomer.full_name,email:selectedCustomer.email}]} series={selectedRecurringBookings}/> : null}

              {workspaceTab === "activity" ? <section className="mx-auto max-w-3xl"><div className="flex items-center gap-2 border-b border-border pb-4"><Clock3 size={15} className="text-accent"/><p className="text-[10px] uppercase tracking-[.2em] text-foreground-muted">Activity Timeline</p></div><div className="mt-5">{selectedActivity.map((event,index) => <div key={event.id} className="relative flex gap-4 pb-6"><div className="relative flex w-3 shrink-0 justify-center"><span className="mt-1.5 size-2.5 border border-accent bg-accent/50"/>{index < selectedActivity.length-1 ? <span className="absolute bottom-0 top-4 w-px bg-border"/> : null}</div><div className="min-w-0"><p className="text-[10px] text-foreground-muted">{formatActivityDate(event.timestamp)}</p><p className="mt-1 text-sm">{event.title}</p><p className="mt-1 text-xs text-foreground-secondary">{event.detail}</p></div></div>)}</div></section> : null}

              {workspaceTab === "notes" ? <section className="mx-auto max-w-3xl border border-border bg-background/35 p-4 sm:p-6"><div className="flex items-center justify-between gap-3"><p className="text-[10px] uppercase tracking-[.2em] text-foreground-muted">Internal Notes</p>{!selectedCustomer.id.startsWith("legacy-guest:") ? <button onClick={() => {setIsEditingNotes((value) => !value);setNotesFeedback("");}} className="min-h-11 border border-border px-4 text-[10px] uppercase tracking-[.14em]">{isEditingNotes ? "Cancel" : "Edit Notes"}</button> : null}</div>{isEditingNotes ? <div className="mt-5"><textarea rows={9} value={notesDraft} onChange={(event) => setNotesDraft(event.target.value)} placeholder="Add notes (Optional)" className="w-full resize-y border border-border bg-background p-4 text-base leading-7 text-foreground outline-none sm:text-sm"/>{notesFeedback ? <p className="mt-3 text-sm text-foreground-secondary">{notesFeedback}</p> : null}<button onClick={saveNotes} disabled={isNotesPending} className="mt-4 min-h-11 bg-accent px-5 text-xs uppercase text-background disabled:opacity-50">{isNotesPending ? "Saving..." : "Save Notes"}</button></div> : <><p className="mt-5 min-h-32 whitespace-pre-wrap border-t border-border pt-5 text-sm leading-7 text-foreground-secondary">{selectedCustomer.notes || "No internal notes yet."}</p>{notesFeedback ? <p className="mt-3 text-sm text-foreground-secondary">{notesFeedback}</p> : null}<p className="mt-4 text-[10px] text-foreground-muted">Only administrators can view these notes.</p></>}</section> : null}
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
