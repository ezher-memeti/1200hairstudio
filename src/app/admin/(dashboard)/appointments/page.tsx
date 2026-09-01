import AdminAppointmentsView from "@/components/admin/AdminAppointmentsView";
import { getUtcIsoForZurichDateTime } from "@/lib/appointments/availability";
import { requireAdminUser } from "@/lib/auth/customer";
import {
  getAdminAppointmentsInRange,
  getAdminBusinessHours,
  getAdminCustomerOptions,
  getAvailabilityExceptionsInRange,
} from "@/lib/appointments/queries";
import { getActiveServices } from "@/lib/public/services";

type SearchParams = {
  view?: string;
  date?: string;
  new?: string;
  customerId?: string;
  appointmentId?: string;
};

function isValidDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function getTodayDateKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function getWeekStart(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  const jsDay = date.getDay();
  const weekday = jsDay === 0 ? 7 : jsDay;
  date.setDate(date.getDate() - (weekday - 1));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function addDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

export default async function AdminAppointmentsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  await requireAdminUser();
  const todayDateKey = getTodayDateKey();
  const view =
    searchParams?.view === "day" || searchParams?.view === "list" ? searchParams.view : "week";
  const selectedDate =
    searchParams?.date && isValidDateKey(searchParams.date) ? searchParams.date : todayDateKey;
  const weekStart = getWeekStart(selectedDate);
  const weekEnd = addDays(weekStart, 6);
  const rangeStart = view === "day" ? selectedDate : weekStart;
  const rangeEnd = view === "day" ? selectedDate : weekEnd;

  const [appointments, businessHours, exceptions, customers, services] = await Promise.all([
    getAdminAppointmentsInRange(
      getUtcIsoForZurichDateTime(rangeStart, "00:00"),
      getUtcIsoForZurichDateTime(addDays(rangeEnd, 1), "00:00"),
    ),
    getAdminBusinessHours(),
    getAvailabilityExceptionsInRange(weekStart, weekEnd),
    getAdminCustomerOptions(),
    getActiveServices(),
  ]);

  return (
    <AdminAppointmentsView
      view={view}
      selectedDate={selectedDate}
      appointments={appointments}
      businessHours={businessHours}
      exceptions={exceptions}
      customers={customers}
      services={services}
      todayDateKey={todayDateKey}
    />
  );
}
