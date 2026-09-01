"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Clock3,
  Mail,
  MessageCircle,
  Phone,
  Search,
  SlidersHorizontal,
  UserRound,
  X,
} from "lucide-react";
import { updateAdminCustomer, updateAdminCustomerNotes } from "@/app/actions/customers";
import { getZurichDateKeyFromIso } from "@/lib/appointments/date-utils";
import type {
  AdminCustomerAppointment,
  AdminCustomerDirectoryEntry,
} from "@/lib/customers/types";
import {
  formatCustomerStatus,
  getCustomerInsights,
  type CustomerStatus,
} from "@/lib/customers/status";
import { getMarketingConsentStatus } from "@/lib/customers/marketing-consent";
import AdminSelect from "@/components/admin/AdminSelect";

type Props = {
  customers: AdminCustomerDirectoryEntry[];
  activeServices: string[];
  todayIso: string;
};

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

function formatCountLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

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

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "C";
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

export default function AdminCustomersView({ customers, activeServices, todayIso }: Props) {
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
  const [isPending, startTransition] = useTransition();
  const [isNotesPending, startNotesTransition] = useTransition();

  const todayTimestamp = useMemo(() => new Date(todayIso).getTime(), [todayIso]);

  const selectedCustomer =
    localCustomers.find((customer) => customer.id === selectedCustomerId) ?? null;
  const selectedStatistics = selectedCustomer
    ? getCustomerStatistics(selectedCustomer, todayTimestamp)
    : null;
  const selectedActivity = selectedCustomer ? getCustomerActivity(selectedCustomer) : [];
  const selectedStatus = selectedCustomer
    ? getCustomerStatusDetails(selectedCustomer, todayTimestamp)
    : null;

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
          <AdminSelect label="Favorite Service" value={favoriteServiceFilter} onChange={setFavoriteServiceFilter} options={[{ value: "all", label: "All active services" }, ...activeServices.map((service) => ({ value: service, label: service }))]} searchable={activeServices.length > 8} className="sm:col-span-2" />
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

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                <section className="border border-border bg-background/35 p-4 lg:col-span-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-admin-primary text-[10px] uppercase tracking-[0.2em] text-foreground-muted">Contact Information</p>
                      <div className="mt-4 space-y-3">
                        <a href={selectedCustomer.email ? `mailto:${selectedCustomer.email}` : undefined} className="flex items-center gap-3 break-all font-admin-primary text-sm text-foreground-secondary transition-colors hover:text-foreground"><Mail size={16} className="shrink-0 text-accent" />{selectedCustomer.email || "No email"}</a>
                        <a href={selectedCustomer.phone ? `tel:${selectedCustomer.phone}` : undefined} className="flex items-center gap-3 font-admin-primary text-sm text-foreground-secondary transition-colors hover:text-foreground"><Phone size={16} className="shrink-0 text-accent" />{selectedCustomer.phone || "No phone"}</a>
                      </div>
                    </div>
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border border-border bg-surface font-admin-display text-2xl text-foreground sm:h-24 sm:w-24 sm:text-3xl">{getInitials(selectedCustomer.full_name)}</div>
                  </div>
                  <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                    {selectedCustomer.email ? <a href={`mailto:${selectedCustomer.email}`} className="inline-flex min-h-11 items-center justify-center gap-2 border border-border font-admin-primary text-[10px] uppercase tracking-[0.15em] text-foreground-secondary transition-colors hover:bg-surface hover:text-foreground"><Mail size={14} /> Email</a> : null}
                    {selectedCustomer.phone ? <a href={`tel:${selectedCustomer.phone}`} className="inline-flex min-h-11 items-center justify-center gap-2 border border-border font-admin-primary text-[10px] uppercase tracking-[0.15em] text-foreground-secondary transition-colors hover:bg-surface hover:text-foreground"><Phone size={14} /> Call</a> : null}
                    {selectedCustomer.phone ? <a href={`https://wa.me/${selectedCustomer.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 border border-border font-admin-primary text-[10px] uppercase tracking-[0.15em] text-emerald-300 transition-colors hover:bg-emerald-500/10"><MessageCircle size={14} /> WhatsApp</a> : null}
                  </div>

                  {isEditing && !selectedCustomer.id.startsWith("legacy-guest:") ? (
                    <div className="mt-5 space-y-3 border-t border-border pt-4">
                      <label className="block space-y-2"><span className="font-admin-primary text-[10px] uppercase tracking-[0.16em] text-foreground-muted">Full Name</span><input type="text" value={editForm.fullName} onChange={(event) => setEditForm((current) => ({ ...current, fullName: event.target.value }))} className="w-full border border-border bg-background px-4 py-3 font-admin-primary text-sm text-foreground outline-none" /></label>
                      <label className="block space-y-2"><span className="font-admin-primary text-[10px] uppercase tracking-[0.16em] text-foreground-muted">Email</span><input type="email" value={editForm.email} onChange={(event) => setEditForm((current) => ({ ...current, email: event.target.value }))} className="w-full border border-border bg-background px-4 py-3 font-admin-primary text-sm text-foreground outline-none" /></label>
                      <label className="block space-y-2"><span className="font-admin-primary text-[10px] uppercase tracking-[0.16em] text-foreground-muted">Phone</span><input type="tel" value={editForm.phone} onChange={(event) => setEditForm((current) => ({ ...current, phone: event.target.value }))} className="w-full border border-border bg-background px-4 py-3 font-admin-primary text-sm text-foreground outline-none" /></label>
                      {editFeedback ? <p className="font-admin-primary text-sm text-foreground-secondary">{editFeedback}</p> : null}
                      <div className="flex gap-2"><button type="button" onClick={saveCustomer} disabled={isPending} className="inline-flex min-h-11 flex-1 items-center justify-center bg-accent px-4 font-admin-primary text-xs uppercase tracking-[0.16em] text-background disabled:opacity-50">{isPending ? "Saving..." : "Save"}</button><button type="button" onClick={() => setIsEditing(false)} className="inline-flex min-h-11 items-center justify-center border border-border px-4 font-admin-primary text-xs uppercase tracking-[0.16em] text-foreground-secondary">Cancel</button></div>
                    </div>
                  ) : null}
                </section>

                <section className="border border-border bg-background/35 p-4 lg:col-span-8">
                  <p className="font-admin-primary text-[10px] uppercase tracking-[0.2em] text-foreground-muted">Customer Statistics</p>
                  <div className="mt-4 grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-3 xl:grid-cols-5">
                    {[["Total Bookings", selectedStatistics?.totalBookings ?? 0], ["Completed Visits", selectedStatistics?.completedVisits ?? 0], ["Upcoming", selectedStatistics?.upcomingCount ?? 0], ["Cancelled", selectedStatistics?.cancellations ?? 0], ["No Shows", selectedStatistics?.noShows ?? 0]].map(([label, value]) => <div key={label} className="bg-surface px-3 py-4"><p className="font-admin-primary text-[9px] uppercase tracking-[0.13em] text-foreground-muted">{label}</p><p className="mt-2 font-admin-display text-2xl text-foreground">{value}</p></div>)}
                  </div>
                  <div className="mt-px grid grid-cols-1 gap-px border border-border bg-border sm:grid-cols-3">
                    {[["Last Visit", selectedStatistics?.lastVisit ? `${selectedStatistics.lastVisit.date_label} · ${selectedStatistics.lastVisit.time_label}` : "—"], ["Next Visit", selectedStatistics?.nextVisit ? `${selectedStatistics.nextVisit.date_label} · ${selectedStatistics.nextVisit.time_label}` : "—"], ["Favorite Service", selectedStatistics?.favoriteService ?? "—"]].map(([label, value]) => <div key={label} className="min-w-0 bg-surface px-4 py-4"><p className="font-admin-primary text-[9px] uppercase tracking-[0.13em] text-foreground-muted">{label}</p><p className="mt-2 break-words font-admin-primary text-sm leading-5 text-foreground">{value}</p></div>)}
                  </div>
                </section>

                <section className="border border-border bg-background/35 p-4 lg:col-span-4">
                  <div className="flex items-center justify-between gap-3"><p className="font-admin-primary text-[10px] uppercase tracking-[0.2em] text-foreground-muted">Upcoming Appointments</p><span className="inline-flex min-w-7 items-center justify-center rounded-full border border-accent/30 bg-accent/10 px-2 py-1 font-admin-primary text-[10px] text-accent">{selectedStatistics?.upcomingAppointments.length ?? 0}</span></div>
                  <div className="mt-4 space-y-2">
                    {selectedStatistics?.upcomingAppointments.map((appointment) => <Link key={appointment.id} href={getAppointmentLink(appointment)} className="group flex min-h-20 items-center justify-between gap-3 border border-border bg-surface px-3 py-3 transition-colors hover:border-foreground-muted hover:bg-background/60"><div className="min-w-0"><p className="font-admin-primary text-sm text-foreground">{appointment.date_label}</p><p className="mt-1 font-admin-primary text-xs text-foreground-secondary">{appointment.time_label} · {appointment.service_name}</p><span className={`mt-2 inline-flex border px-2 py-1 font-admin-primary text-[9px] uppercase tracking-[0.12em] ${getStatusClasses(appointment.status)}`}>{formatStatusLabel(appointment.status)}</span></div><ChevronRight size={16} className="shrink-0 text-foreground-muted transition-transform group-hover:translate-x-0.5" /></Link>)}
                    {selectedStatistics?.upcomingAppointments.length === 0 ? <div className="border border-dashed border-border px-4 py-7 text-center"><p className="font-admin-primary text-sm text-foreground-secondary">No upcoming appointments.</p><Link href={getCreateAppointmentLink(selectedCustomer)} className="mt-4 inline-flex min-h-11 items-center justify-center bg-accent px-4 font-admin-primary text-[10px] uppercase tracking-[0.16em] text-background">Create Appointment</Link></div> : null}
                  </div>
                </section>

                <section className="border border-border bg-background/35 p-4 lg:col-span-4">
                  <div className="flex items-center gap-2"><Clock3 size={15} className="text-foreground-muted" /><p className="font-admin-primary text-[10px] uppercase tracking-[0.2em] text-foreground-muted">Activity Timeline</p></div>
                  <div className="mt-4 space-y-0">
                    {selectedActivity.slice(0, 8).map((event, index) => <div key={event.id} className="relative flex gap-3 pb-4 last:pb-0"><div className="relative flex w-3 shrink-0 justify-center"><span className="mt-1.5 h-2.5 w-2.5 rounded-full border border-accent/50 bg-accent/60" />{index < Math.min(selectedActivity.length, 8) - 1 ? <span className="absolute bottom-0 top-4 w-px bg-border" /> : null}</div><div className="min-w-0"><p className="font-admin-primary text-[10px] text-foreground-muted">{formatActivityDate(event.timestamp)}</p><p className="mt-1 font-admin-primary text-sm text-foreground">{event.title}</p><p className="mt-1 font-admin-primary text-xs text-foreground-secondary">{event.detail}</p></div></div>)}
                  </div>
                </section>

                <div className="space-y-4 lg:col-span-4">
                  <section className="border border-border bg-background/35 p-4">
                    <div className="flex items-center justify-between gap-3"><p className="font-admin-primary text-[10px] uppercase tracking-[0.2em] text-foreground-muted">Internal Notes</p>{!selectedCustomer.id.startsWith("legacy-guest:") ? <button type="button" onClick={() => { setIsEditingNotes((current) => !current); setNotesFeedback(""); }} className="inline-flex min-h-10 items-center justify-center border border-border px-3 font-admin-primary text-[10px] uppercase tracking-[0.14em] text-foreground-secondary">{isEditingNotes ? "Cancel" : "Edit"}</button> : null}</div>
                    {isEditingNotes ? <div className="mt-4 space-y-3"><textarea rows={5} value={notesDraft} onChange={(event) => setNotesDraft(event.target.value)} className="w-full resize-none border border-border bg-background px-4 py-3 font-admin-primary text-sm leading-6 text-foreground outline-none" placeholder="Private admin notes" />{notesFeedback ? <p className="font-admin-primary text-sm text-foreground-secondary">{notesFeedback}</p> : null}<button type="button" onClick={saveNotes} disabled={isNotesPending} className="inline-flex min-h-11 w-full items-center justify-center bg-accent px-4 font-admin-primary text-xs uppercase tracking-[0.16em] text-background disabled:opacity-50">{isNotesPending ? "Saving..." : "Save Notes"}</button></div> : <><p className="mt-4 min-h-20 whitespace-pre-wrap border border-border bg-surface px-3 py-3 font-admin-primary text-sm leading-6 text-foreground-secondary">{selectedCustomer.notes || "No internal notes yet."}</p>{notesFeedback ? <p className="mt-3 font-admin-primary text-sm text-foreground-secondary">{notesFeedback}</p> : null}<p className="mt-3 font-admin-primary text-[10px] text-foreground-muted">Notes are only visible to admins.</p></>}
                  </section>
                  <section className="border border-border bg-background/35 p-4"><div className="flex items-center gap-2"><UserRound size={15} className="text-foreground-muted" /><p className="font-admin-primary text-[10px] uppercase tracking-[0.2em] text-foreground-muted">Customer Status</p></div>{selectedStatus ? <div className="mt-4 space-y-3"><div className="flex items-center justify-between gap-4"><span className={`inline-flex border px-3 py-2 font-admin-primary text-[10px] uppercase tracking-[0.16em] ${getCustomerStatusClasses(selectedStatus.status)}`}>{formatCustomerStatus(selectedStatus.status)}</span><p className="font-admin-primary text-xs text-foreground-muted">Dynamically calculated</p></div><div className="space-y-1 border-t border-border pt-3 font-admin-primary text-xs text-foreground-secondary"><p>{selectedStatus.completedVisits} completed visits</p><p>Last completed: {selectedStatus.lastCompletedAppointment ? `${selectedStatus.lastCompletedAppointment.date_label} · ${selectedStatus.lastCompletedAppointment.time_label}` : "—"}</p><p>Next confirmed: {selectedStatus.nextConfirmedAppointment ? `${selectedStatus.nextConfirmedAppointment.date_label} · ${selectedStatus.nextConfirmedAppointment.time_label}` : "—"}</p>{selectedStatus.daysSinceLastCompleted !== null ? <p>{selectedStatus.daysSinceLastCompleted} days since last completed visit</p> : null}</div></div> : null}</section>
                  <section className="border border-border bg-background/35 p-4"><div className="flex items-center gap-2"><Mail size={15} className="text-foreground-muted" /><p className="font-admin-primary text-[10px] uppercase tracking-[0.2em] text-foreground-muted">Email Marketing</p></div>{(() => { const marketingStatus = getMarketingConsentStatus(selectedCustomer); return <div className="mt-4 space-y-2"><span className={`inline-flex border px-3 py-2 font-admin-primary text-[10px] uppercase tracking-[0.16em] ${marketingStatus === "subscribed" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : marketingStatus === "unsubscribed" ? "border-amber-500/30 bg-amber-500/10 text-amber-200" : "border-border bg-background/60 text-foreground-muted"}`}>{marketingStatus.replace("_", " ")}</span>{selectedCustomer.marketing_email_consented_at ? <p className="font-admin-primary text-xs text-foreground-secondary">Consent: {formatActivityDate(selectedCustomer.marketing_email_consented_at)}</p> : null}{selectedCustomer.marketing_email_consent_source ? <p className="font-admin-primary text-xs text-foreground-secondary">Source: {selectedCustomer.marketing_email_consent_source.replace(/_/g, " ")}</p> : null}{selectedCustomer.marketing_email_unsubscribed_at ? <p className="font-admin-primary text-xs text-foreground-secondary">Unsubscribed: {formatActivityDate(selectedCustomer.marketing_email_unsubscribed_at)}</p> : null}<p className="font-admin-primary text-[10px] leading-5 text-foreground-muted">Read-only. Subscription requires customer consent.</p></div>; })()}</section>
                </div>

                <section className="border border-border bg-background/35 lg:col-span-12">
                  <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-4"><div className="flex items-center gap-2"><CalendarDays size={15} className="text-accent" /><p className="font-admin-primary text-[10px] uppercase tracking-[0.2em] text-foreground-muted">Appointment History</p></div><span className="font-admin-primary text-xs text-foreground-muted">{formatCountLabel(selectedStatistics?.history.length ?? 0, "appointment", "appointments")}</span></div>
                  <div className="divide-y divide-border">
                    {(showAllHistory ? selectedStatistics?.history : selectedStatistics?.history.slice(0, 6))?.map((appointment) => <Link key={appointment.id} href={getAppointmentLink(appointment)} className="group grid min-h-20 grid-cols-1 gap-2 px-4 py-4 transition-colors hover:bg-surface sm:grid-cols-[minmax(150px,1fr)_minmax(150px,1fr)_minmax(140px,0.8fr)_120px_80px_32px] sm:items-center sm:gap-4"><div><p className="font-admin-primary text-sm text-foreground">{appointment.date_label}</p></div><p className="font-admin-primary text-sm text-foreground-secondary">{appointment.service_name}</p><p className="font-admin-primary text-sm text-foreground-secondary">{appointment.time_label}</p><span className={`w-fit border px-2 py-1 font-admin-primary text-[9px] uppercase tracking-[0.12em] ${getStatusClasses(appointment.status)}`}>{formatStatusLabel(appointment.status)}</span><p className="font-admin-primary text-xs text-foreground-muted">{getDurationLabel(appointment)}</p><ChevronRight size={16} className="hidden text-foreground-muted transition-transform group-hover:translate-x-0.5 sm:block" /></Link>)}
                    {selectedStatistics?.history.length === 0 ? <div className="px-4 py-10 text-center"><p className="font-admin-primary text-sm text-foreground-secondary">No past appointments yet.</p></div> : null}
                  </div>
                  {(selectedStatistics?.history.length ?? 0) > 6 ? <div className="border-t border-border p-3 text-center"><button type="button" onClick={() => setShowAllHistory((current) => !current)} className="inline-flex min-h-11 items-center justify-center border border-border px-5 font-admin-primary text-[10px] uppercase tracking-[0.16em] text-foreground-secondary transition-colors hover:bg-surface hover:text-foreground">{showAllHistory ? "Show Recent" : "View Full History"}</button></div> : null}
                </section>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
