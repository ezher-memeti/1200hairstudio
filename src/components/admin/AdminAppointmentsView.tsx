"use client";
import { isPushId } from "@/lib/push/preferences";
import { getZurichDateKeyFromIso } from "@/lib/appointments/date-utils";
import { weekdayLabel } from "@/i18n/format";
import { formatDateForLocale } from "@/i18n/config";


import { intlLocale } from "@/i18n/config";
import { useLocale } from "next-intl";

import { useUiText } from "@/i18n/use-ui-text";

import { useTranslations } from "next-intl";


import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import { ChevronLeft, ChevronRight, Download, Eye, Mail, X } from "lucide-react";
import {
  createAdminAppointment,
  getAdminAvailableSlotTimes,
  removeAdminAppointment,
  updateAdminAppointment,
} from "@/app/actions/appointments";
import { generateAdminReceiptForAppointment, resendAdminReceipt } from "@/app/actions/finance";
import { removeAdminRecurringAppointment } from "@/app/actions/recurring-bookings";
import { formatZurichTime } from "@/lib/appointments/availability";
import type {
  AdminAppointmentDetail,
  AdminCustomerOption,
  AppointmentStatus,
} from "@/lib/appointments/types";
import type { AvailabilityExceptionRecord } from "@/lib/availability-exceptions/types";
import type { BusinessHourRecord } from "@/lib/business-hours/types";
import type { AvailableSlotDisplay } from "@/lib/public/available-slots";
import { getEffectiveHours, toDateKey } from "@/lib/public/booking-availability-utils";
import type { ServiceRecord } from "@/lib/services/types";
import AdminSelect from "@/components/admin/AdminSelect";
import DateTimePicker from "@/components/admin/ui/DateTimePicker";
import CheckoutDialog from "@/components/admin/CheckoutDialog";
import type { AppointmentFinanceSummary, FinanceAppointment, FinancePromotion } from "@/lib/finance/types";
import type { ReceiptRecord } from "@/lib/receipts/types";
import type { PaymentMethodSetting } from "@/lib/admin/settings";
import RecurringBookingManager from "@/components/recurring-bookings/RecurringBookingManager";
import type { RecurringBookingRecord } from "@/lib/recurring-bookings/types";
import type { AppointmentSaleLink } from "@/lib/sales/types";

type ViewMode = "week" | "day" | "list";

type Props = {
  view: ViewMode;
  selectedDate: string;
  appointments: AdminAppointmentDetail[];
  businessHours: BusinessHourRecord[];
  exceptions: AvailabilityExceptionRecord[];
  customers: AdminCustomerOption[];
  services: ServiceRecord[];
  todayDateKey: string;
  financeSummaries: AppointmentFinanceSummary[];
  promotions: FinancePromotion[];
  receipts: ReceiptRecord[];
  enabledPaymentMethods: PaymentMethodSetting[];
  recurringBookings: RecurringBookingRecord[];
  sales: AppointmentSaleLink[];
};

type AppointmentCard = AdminAppointmentDetail & {
  dateKey: string;
  startMinutes: number;
  endMinutes: number;
  lane: number;
  laneCount: number;
};

const SLOT_MINUTES = 30;

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No Show",
};

const WEEK_COLUMN_WIDTH = 168;
const WEEK_ROW_HEIGHT = 54;
const WEEK_NORMALIZED_HEIGHT = 520;

function formatServicePrice(price: number) {
  return `CHF ${price.toFixed(0)}`;
}

type CreateFormState = {
  customerId: string | null;
  customerSearch: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  serviceId: string;
  dateKey: string;
  startTime: string;
  notes: string;
  sendConfirmationEmail: boolean;
};

type EditFormState = {
  appointmentId: string;
  serviceId: string;
  dateKey: string;
  startTime: string;
  notes: string;
  sendNotification: boolean;
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

function formatDayLabel(dateKey: string, locale: string = "de") {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: "Europe/Zurich",
    weekday: "long",
    day: "2-digit",
    month: "short",
  }).format(new Date(`${dateKey}T12:00:00`));
}

function formatDateHeading(dateKey: string, locale: string = "de") {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: "Europe/Zurich",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(`${dateKey}T12:00:00`));
}

function formatDateRange(startDateKey: string, endDateKey: string, locale: string = "de") {
  const formatter = new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: "Europe/Zurich",
    day: "2-digit",
    month: "short",
  });
  const yearFormatter = new Intl.DateTimeFormat(intlLocale(locale), {
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

function getMinutesFromTimeString(value: string | null) {
  if (!value) {
    return null;
  }

  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
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
  customers,
  services,
  todayDateKey,
  financeSummaries,
  promotions,
  receipts,
  enabledPaymentMethods,
  recurringBookings,
  sales,
}: Props) {
  const locale = useLocale();

  const uiText = useUiText();

  const history = useTranslations("calendarHistory");
  const ui = useTranslations("ui");
  const audit = useTranslations("audit");

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [appointmentState, setAppointmentState] = useState(appointments);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isRemoveOpen, setIsRemoveOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateFormState>({
    customerId: null,
    customerSearch: "",
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    serviceId: "",
    dateKey: selectedDate,
    startTime: "",
    notes: "",
    sendConfirmationEmail: true,
  });
  const [editForm, setEditForm] = useState<EditFormState | null>(null);
  const [createFeedback, setCreateFeedback] = useState("");
  const [editFeedback, setEditFeedback] = useState("");
  const [removeFeedback, setRemoveFeedback] = useState("");
  const [availableSlots, setAvailableSlots] = useState<AvailableSlotDisplay[]>([]);
  const [editAvailableSlots, setEditAvailableSlots] = useState<AvailableSlotDisplay[]>([]);
  const [slotsError, setSlotsError] = useState("");
  const [editSlotsError, setEditSlotsError] = useState("");
  const [sendCancellationEmail, setSendCancellationEmail] = useState(true);
  const [draftNotes, setDraftNotes] = useState("");
  const [feedback, setFeedback] = useState("");
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [receiptState, setReceiptState] = useState(receipts);
  const [receiptFeedback, setReceiptFeedback] = useState("");
  const [isReceiptPending, startReceiptTransition] = useTransition();
  const [isPending, startTransition] = useTransition();
  const [isCreatePending, startCreateTransition] = useTransition();
  const [isEditPending, startEditTransition] = useTransition();

  const exceptionsByDate = useMemo(
    () => new Map(exceptions.map((exception) => [exception.date, exception])),
    [exceptions],
  );
  useEffect(() => {
    setAppointmentState(appointments);
  }, [appointments]);
  useEffect(() => {
    setReceiptState(receipts);
  }, [receipts]);

  useEffect(() => {
    const appointmentId = searchParams.get("appointmentId");
    if (!appointmentId || !appointments.some((appointment) => appointment.id === appointmentId)) {
      return;
    }

    document.querySelector<HTMLElement>(`[data-appointment-id="${appointmentId}"]`)?.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
    setSelectedAppointmentId(appointmentId);
  }, [appointments, searchParams]);

  const appointmentsByDate = useMemo(() => buildAppointments(appointmentState), [appointmentState]);
  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDate]);
  const weekStart = weekDates[0];
  const weekEnd = weekDates[6];
  const detailHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (selectedAppointmentId) detailHeading.current?.focus({ preventScroll: true });
  }, [selectedAppointmentId]);
  const selectedDetail =
    appointmentState.find((appointment) => appointment.id === selectedAppointmentId) ?? null;
  const notificationHistory = Boolean(selectedDetail && isPushId(searchParams.get("notification")) && getZurichDateKeyFromIso(selectedDetail.start_at) < todayDateKey);
  const selectedFinance = selectedDetail
    ? financeSummaries.find((item) => item.appointment_id === selectedDetail.id) ?? null
    : null;
  const selectedReceipt = selectedDetail ? receiptState.find((receipt) => receipt.appointment_id === selectedDetail.id) ?? null : null;
  const selectedSale = selectedDetail
    ? sales.find((sale) => sale.appointment_id === selectedDetail.id) ?? null
    : null;
  const selectedFinanceAppointment: FinanceAppointment | null = selectedDetail && selectedFinance
    ? {
        appointmentId: selectedDetail.id,
        bookingReference: selectedDetail.booking_reference ?? "No reference",
        customerName: selectedDetail.customer_name,
        serviceId: selectedDetail.service_id,
        serviceName: selectedDetail.service_name,
        startAt: selectedDetail.start_at,
        appointmentStatus: selectedDetail.status,
        originalPrice: Number(selectedFinance.original_price ?? 0),
        amountDue: Number(selectedFinance.amount_due ?? 0),
        discountAmount: Number(selectedFinance.discount_amount ?? 0),
        promotionId: selectedDetail.promotion_id ?? null,
        discountSource: selectedDetail.discount_source ?? null,
        discountLabel: selectedDetail.discount_label ?? null,
        discountType: selectedDetail.discount_type ?? null,
        discountValue: selectedDetail.discount_value == null ? null : Number(selectedDetail.discount_value),
        totalPaid: Number(selectedFinance.total_paid ?? 0),
        totalRefunded: Number(selectedFinance.total_refunded ?? 0),
        netPaid: Number(selectedFinance.net_paid ?? 0),
        paymentStatus: selectedFinance.payment_status ?? "unpaid",
      }
    : null;

  useEffect(() => {
    setDraftNotes(selectedDetail?.notes ?? "");
    setFeedback("");
    setReceiptFeedback("");
  }, [selectedDetail]);

  useEffect(() => {
    if (!selectedDetail && !isCreateOpen && !isEditOpen && !isRemoveOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isCreateOpen, isEditOpen, isRemoveOpen, selectedDetail]);

  function generateReceipt() {
    if (!selectedDetail) return;
    setReceiptFeedback("");
    startReceiptTransition(async () => {
      const result = await generateAdminReceiptForAppointment(selectedDetail.id);
      if (result.error || !result.receipt) { setReceiptFeedback(result.error ?? "The receipt could not be generated."); return; }
      setReceiptState((current) => current.some((receipt) => receipt.id === result.receipt.id) ? current : [...current, result.receipt as ReceiptRecord]);
      setReceiptFeedback(`Beleg ${result.receipt.receipt_number} generated.`);
      router.refresh();
    });
  }

  function emailReceipt() {
    if (!selectedReceipt) return;
    setReceiptFeedback("");
    startReceiptTransition(async () => {
      const result = await resendAdminReceipt(selectedReceipt.id);
      if (result.error || !result.emailedAt) { setReceiptFeedback(result.error ?? "The receipt could not be emailed."); return; }
      setReceiptState((current) => current.map((receipt) => receipt.id === selectedReceipt.id ? { ...receipt, emailed_at: result.emailedAt } : receipt));
      setReceiptFeedback("Receipt emailed to the customer.");
      router.refresh();
    });
  }

  useEffect(() => {
    if (!selectedDetail || !isEditOpen) {
      return;
    }

    setEditForm({
      appointmentId: selectedDetail.id,
      serviceId: selectedDetail.service_id,
      dateKey: getDateKeyFromIso(selectedDetail.start_at),
      startTime: formatZurichTime(selectedDetail.start_at),
      notes: selectedDetail.notes ?? "",
      sendNotification: true,
    });
    setEditFeedback("");
  }, [isEditOpen, selectedDetail]);

  useEffect(() => {
    setCreateForm((current) => ({
      ...current,
      dateKey: selectedDate,
    }));
  }, [selectedDate]);

  useEffect(() => {
    if (searchParams.get("new") !== "1") {
      return;
    }

    const customerId = searchParams.get("customerId");
    const customer = customers.find((item) => item.id === customerId);
    setCreateForm({
      customerId: customer?.id ?? null,
      customerSearch: customer?.full_name ?? "",
      customerName: customer?.full_name ?? "",
      customerEmail: customer?.email ?? "",
      customerPhone: customer?.phone ?? "",
      serviceId: "",
      dateKey: selectedDate,
      startTime: "",
      notes: "",
      sendConfirmationEmail: true,
    });
    setAvailableSlots([]);
    setSlotsError("");
    setCreateFeedback("");
    setIsCreateOpen(true);

    const params = new URLSearchParams(searchParams.toString());
    params.delete("new");
    params.delete("customerId");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [customers, pathname, router, searchParams, selectedDate]);

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

  const selectedService = useMemo(
    () => services.find((service) => service.id === createForm.serviceId) ?? null,
    [createForm.serviceId, services],
  );

  const filteredCustomers = useMemo(() => {
    const query = createForm.customerSearch.trim().toLowerCase();

    if (!query) {
      return customers.slice(0, 8);
    }

    return customers
      .filter((customer) =>
        [customer.full_name, customer.email, customer.phone]
          .some((value) => value.toLowerCase().includes(query)),
      )
      .slice(0, 8);
  }, [createForm.customerSearch, customers]);

  useEffect(() => {
    if (!isCreateOpen || !createForm.serviceId || !createForm.dateKey) {
      setAvailableSlots([]);
      setSlotsError("");
      return;
    }

    startCreateTransition(async () => {
      const result = await getAdminAvailableSlotTimes({
        serviceId: createForm.serviceId,
        dateKey: createForm.dateKey,
      });

      setAvailableSlots(result.slots);
      setSlotsError(result.error ?? "");
      setCreateForm((current) => {
        const currentStillValid = result.slots.some((slot) => slot.time === current.startTime);
        return {
          ...current,
          startTime: currentStillValid ? current.startTime : result.slots[0]?.time ?? "",
        };
      });
    });
  }, [createForm.dateKey, createForm.serviceId, isCreateOpen]);

  useEffect(() => {
    if (!isEditOpen || !editForm?.serviceId || !editForm.dateKey || !editForm.appointmentId) {
      setEditAvailableSlots([]);
      setEditSlotsError("");
      return;
    }

    startEditTransition(async () => {
      const result = await getAdminAvailableSlotTimes({
        serviceId: editForm.serviceId,
        dateKey: editForm.dateKey,
        excludeAppointmentId: editForm.appointmentId,
      });

      setEditAvailableSlots(result.slots);
      setEditSlotsError(result.error ?? "");
      setEditForm((current) => {
        if (!current) {
          return current;
        }
        const currentStillValid = result.slots.some((slot) => slot.time === current.startTime);
        return {
          ...current,
          startTime: currentStillValid ? current.startTime : result.slots[0]?.time ?? current.startTime,
        };
      });
    });
  }, [editForm?.appointmentId, editForm?.dateKey, editForm?.serviceId, isEditOpen]);

  function resetCreateForm() {
    setCreateForm({
      customerId: null,
      customerSearch: "",
      customerName: "",
      customerEmail: "",
      customerPhone: "",
      serviceId: "",
      dateKey: selectedDate,
      startTime: "",
      notes: "",
      sendConfirmationEmail: true,
    });
    setAvailableSlots([]);
    setSlotsError("");
    setCreateFeedback("");
  }

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
      setFeedback(result.warning ?? "Saved.");
    });
  }

  function removeAppointment() {
    if (!selectedDetail) {
      return;
    }

    startTransition(async () => {
      if (selectedDetail.recurring_booking_id) {
        const recurringResult = await removeAdminRecurringAppointment(selectedDetail.id);
        if (recurringResult.error) {
          setRemoveFeedback(recurringResult.error);
          return;
        }
        setAppointmentState((current) => current.filter((appointment) => appointment.id !== selectedDetail.id));
        setFeedback("Recurring appointment removed. The regular booking remains active.");
        setSelectedAppointmentId(null);
        setIsRemoveOpen(false);
        router.refresh();
        return;
      }
      const result = await removeAdminAppointment({
        appointmentId: selectedDetail.id,
        sendNotification: sendCancellationEmail,
      });

      if (result.error) {
        setRemoveFeedback(result.error);
        return;
      }

      setAppointmentState((current) =>
        current.filter((appointment) => appointment.id !== selectedDetail.id),
      );
      setFeedback(
        result.emailStatus === "sent"
          ? "Appointment removed and cancellation email sent."
          : result.emailStatus === "failed"
            ? `Appointment removed, but cancellation email failed${result.emailError ? `: ${result.emailError}` : "."}`
            : sendCancellationEmail
              ? "Appointment removed. Cancellation email skipped because no customer email was available."
              : "Appointment removed without email.",
      );
      setSelectedAppointmentId(null);
      setIsRemoveOpen(false);
      router.refresh();
    });
  }

  function openCreateModal() {
    resetCreateForm();
    setIsCreateOpen(true);
  }

  function closeCreateModal() {
    setIsCreateOpen(false);
    setCreateForm({
      customerId: null,
      customerSearch: "",
      customerName: "",
      customerEmail: "",
      customerPhone: "",
      serviceId: "",
      dateKey: selectedDate,
      startTime: "",
      notes: "",
      sendConfirmationEmail: true,
    });
    setAvailableSlots([]);
    setSlotsError("");
  }

  function selectCustomer(customer: AdminCustomerOption) {
    setCreateForm((current) => ({
      ...current,
      customerId: customer.id,
      customerSearch: customer.full_name,
      customerName: customer.full_name,
      customerEmail: customer.email,
      customerPhone: customer.phone,
    }));
  }

  function openEditModal() {
    if (!selectedDetail) {
      return;
    }

    setIsEditOpen(true);
    setEditFeedback("");
  }

  function closeEditModal() {
    setIsEditOpen(false);
    setEditForm(null);
    setEditAvailableSlots([]);
    setEditSlotsError("");
  }

  function openRemoveModal() {
    setIsRemoveOpen(true);
    setSendCancellationEmail(true);
    setRemoveFeedback("");
  }

  function closeRemoveModal() {
    setIsRemoveOpen(false);
    setRemoveFeedback("");
  }

  function submitCreateAppointment() {
    startCreateTransition(async () => {
      setCreateFeedback("");

      const result = await createAdminAppointment({
        customerId: createForm.customerId,
        customerName: createForm.customerName,
        customerEmail: createForm.customerEmail,
        customerPhone: createForm.customerPhone,
        serviceId: createForm.serviceId,
        dateKey: createForm.dateKey,
        startTime: createForm.startTime,
        notes: createForm.notes,
        sendConfirmationEmail: createForm.sendConfirmationEmail,
      });

      if (result.error) {
        setCreateFeedback(result.error);
        return;
      }

      setCreateFeedback(
        result.emailStatus === "sent"
          ? "Appointment created and confirmation email sent."
          : result.emailStatus === "failed"
            ? `Appointment created, but confirmation email failed${result.emailError ? `: ${result.emailError}` : "."}`
            : createForm.sendConfirmationEmail
              ? "Appointment created. Confirmation email skipped because no customer email was available."
              : "Appointment created. Confirmation email was not sent.",
      );
      closeCreateModal();
      router.refresh();
    });
  }

  function submitEditAppointment() {
    if (!editForm) {
      return;
    }

    startEditTransition(async () => {
      setEditFeedback("");
      const result = await updateAdminAppointment({
        appointmentId: editForm.appointmentId,
        serviceId: editForm.serviceId,
        dateKey: editForm.dateKey,
        startTime: editForm.startTime,
        notes: editForm.notes,
        sendNotification: editForm.sendNotification,
      });

      if (result.error) {
        setEditFeedback(result.error);
        return;
      }

      setFeedback(
        result.emailStatus === "sent"
          ? "Appointment updated and notification email sent."
          : result.emailStatus === "failed"
            ? `Appointment updated, but notification email could not be sent${result.emailError ? `: ${result.emailError}` : "."}`
            : editForm.sendNotification
              ? "Appointment updated. Notification email skipped because no customer email was available."
              : "Appointment updated without email.",
      );
      closeEditModal();
      setSelectedAppointmentId(null);
      router.refresh();
    });
  }

  return (
    <section className="space-y-8">
      <div className="space-y-4">
        <p className="font-admin-primary text-xs uppercase tracking-[0.34em] text-foreground-secondary">
          {ui("m1f3f4957c553")}</p>
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <h1 className="font-admin-display text-[clamp(2.2rem,5vw,4.25rem)] font-semibold uppercase leading-[0.95] tracking-[-0.04em] text-foreground">
              {ui("m1f3f4957c553")}</h1>
            <p className="max-w-2xl font-admin-primary text-sm leading-7 text-foreground-secondary sm:text-base">
              {ui("m89258c1842e4")}</p>
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
                  {uiText(mode)}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex min-h-12 items-center justify-center border border-border bg-accent px-5 py-3 font-admin-primary text-sm uppercase tracking-[0.18em] text-background transition-colors hover:bg-accent-hover"
          >
            {ui("me9add7f4de3f")}</button>
        </div>
      </div>

      {createFeedback && !isCreateOpen ? (
        <div className="border border-border bg-surface px-5 py-4">
          <p className="font-admin-primary text-sm text-foreground-secondary">{uiText(createFeedback)}</p>
        </div>
      ) : null}

      <div className="flex flex-col gap-4 border border-border bg-surface px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="space-y-1">
          <p className="font-admin-primary text-xs uppercase tracking-[0.22em] text-foreground-muted">
            {uiText(view === "week" ? "Week Range" : view === "day" ? "Selected Day" : "List Range")}
          </p>
          <p className="font-admin-display text-2xl uppercase tracking-[-0.04em] text-foreground">
            {uiText(view === "day" ? formatDateHeading(selectedDate, locale) : formatDateRange(weekStart, weekEnd, locale))}
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
            {ui("m50f94286ba30")}</button>
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
            {ui("mbc981983e7f5")}<ChevronRight size={16} />
          </button>
        </div>
      </div>

      {view === "week" ? (
        <div className="border border-border bg-surface">
          <div className="overflow-x-auto">
            <div className="flex min-w-max items-start gap-0">
              {weekDates.map((dateKey, columnIndex) => {
                const effectiveHours = effectiveHoursByDate.get(dateKey)!;
                const dayStart = getMinutesFromTimeString(effectiveHours.open_time);
                const dayEnd = getMinutesFromTimeString(effectiveHours.close_time);
                const isClosed =
                  effectiveHours.is_closed ||
                  dayStart === null ||
                  dayEnd === null ||
                  dayEnd <= dayStart;
                const dayAppointments = (appointmentsByDate.get(dateKey) ?? []).filter(
                  (appointment) =>
                    !isClosed &&
                    appointment.startMinutes >= dayStart &&
                    appointment.endMinutes <= dayEnd,
                );
                const totalOpenMinutes =
                  !isClosed && dayStart !== null && dayEnd !== null ? dayEnd - dayStart : 0;
                const localSlotCount =
                  !isClosed && dayStart !== null && dayEnd !== null
                    ? Math.max(1, totalOpenMinutes / SLOT_MINUTES)
                    : 0;

                return (
                  <div
                    key={dateKey}
                    className="shrink-0 border-r border-border last:border-r-0"
                    style={{ width: `${WEEK_COLUMN_WIDTH}px` }}
                  >
                    <div
                      className={`sticky top-0 z-20 border-b border-border px-4 py-4 ${
                        dateKey === todayDateKey ? "bg-accent/10" : "bg-surface"
                      }`}
                    >
                      <p className="font-admin-display text-lg uppercase tracking-[-0.04em] text-foreground">
                        {weekdayLabel(columnIndex + 1, locale)}
                      </p>
                      <p className="mt-1 font-admin-primary text-sm text-foreground-secondary">
                        {formatDayLabel(dateKey, locale)}
                      </p>
                      <p className="mt-2 font-admin-primary text-[11px] uppercase tracking-[0.2em] text-foreground-muted">
                        {uiText(isClosed
                          ? "Closed"
                          : `${effectiveHours.open_time?.slice(0, 5) ?? "--:--"}-${
                              effectiveHours.close_time?.slice(0, 5) ?? "--:--"
                            }`)}
                      </p>
                    </div>

                    {isClosed ? (
                      <div
                        className="flex items-center justify-center bg-background/70 px-4 text-center"
                        style={{ height: `${WEEK_NORMALIZED_HEIGHT}px` }}
                      >
                        <p className="font-admin-primary text-xs uppercase tracking-[0.18em] text-foreground-muted">
                          {effectiveHours.reason || uiText("Closed")}
                        </p>
                      </div>
                    ) : (
                      <div
                        className={`relative bg-background/35 ${
                          dateKey === todayDateKey ? "bg-accent/5" : ""
                        }`}
                        style={{ height: `${WEEK_NORMALIZED_HEIGHT}px` }}
                      >
                        {Array.from({ length: localSlotCount + 1 }, (_, index) => {
                          const minutes = dayStart! + index * SLOT_MINUTES;
                          const top =
                            totalOpenMinutes > 0
                              ? (index * SLOT_MINUTES * WEEK_NORMALIZED_HEIGHT) / totalOpenMinutes
                              : 0;
                          const isFullHour = minutes % 60 === 0;
                          const isLast = index === localSlotCount;

                          return (
                            <div
                              key={`${dateKey}-tick-${minutes}`}
                              className="absolute inset-x-0"
                              style={{ top: `${top}px` }}
                            >
                              <div
                                className={`border-t ${isFullHour ? "border-border/60" : "border-border/25"}`}
                              />
                              {!isLast && isFullHour ? (
                                <span className="absolute left-2 top-1 font-admin-primary text-[10px] uppercase tracking-[0.14em] text-foreground-muted">
                                  {getSlotLabel(minutes)}
                                </span>
                              ) : null}
                            </div>
                          );
                        })}

                        {dayAppointments.map((appointment) => {
                          const offsetMinutes = appointment.startMinutes - dayStart!;
                          const durationMinutes = appointment.endMinutes - appointment.startMinutes;
                          const top =
                            totalOpenMinutes > 0
                              ? (offsetMinutes * WEEK_NORMALIZED_HEIGHT) / totalOpenMinutes
                              : 0;
                          const height = Math.max(
                            44,
                            totalOpenMinutes > 0
                              ? (durationMinutes * WEEK_NORMALIZED_HEIGHT) / totalOpenMinutes - 6
                              : 44,
                          );
                          const lanes = Math.max(appointment.laneCount, 1);
                          const laneWidth = `calc((100% - ${(lanes + 1) * 4}px) / ${lanes})`;
                          const showStatus = height >= 110;
                          const showService = height >= 72;

                          return (
                            <button
                              key={appointment.id}
                              data-appointment-id={appointment.id}
                              type="button"
                              onClick={() => setSelectedAppointmentId(appointment.id)}
                              className={`absolute z-10 overflow-hidden border px-2 py-2 text-left shadow-[0_8px_24px_rgba(0,0,0,0.16)] transition-transform hover:-translate-y-0.5 ${getStatusTone(
                                appointment.status,
                              )}`}
                              style={{
                                left: `calc(${appointment.lane} * ${laneWidth} + ${(appointment.lane + 1) * 4}px)`,
                                width: laneWidth,
                                top: `${top + 3}px`,
                                height: `${height}px`,
                              }}
                            >
                              <p className="truncate font-admin-display text-xs uppercase tracking-[-0.03em]">
                                {appointment.customer_name}
                              </p>
                              {showService ? (
                                <p className="truncate font-admin-primary text-[10px] uppercase tracking-[0.14em] opacity-90">
                                  {appointment.service_name}
                                </p>
                              ) : null}
                              <p className="truncate font-admin-primary text-[10px] opacity-80">
                                {appointment.time_label}
                              </p>
                              {showStatus ? (
                                <p className="truncate font-admin-primary text-[10px] uppercase tracking-[0.14em] opacity-75">
                                  {STATUS_LABELS[appointment.status]}
                                </p>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    )}
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
            const timelineStart = getMinutesFromTimeString(effectiveHours.open_time);
            const timelineEnd = getMinutesFromTimeString(effectiveHours.close_time);
            const isClosed =
              effectiveHours.is_closed ||
              timelineStart === null ||
              timelineEnd === null ||
              timelineEnd <= timelineStart;
            const slotCount =
              !isClosed && timelineStart !== null && timelineEnd !== null
                ? Math.max(1, (timelineEnd - timelineStart) / SLOT_MINUTES)
                : 0;

            return (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-admin-primary text-xs uppercase tracking-[0.22em] text-foreground-muted">
                      {ui("m018514a3d58a")}</p>
                    <p className="font-admin-display text-2xl uppercase tracking-[-0.04em] text-foreground">
                      {formatDateHeading(selectedDate, locale)}
                    </p>
                  </div>
                  <p className="font-admin-primary text-xs uppercase tracking-[0.22em] text-foreground-secondary">
                    {effectiveHours.is_closed
                      ? effectiveHours.reason || uiText("Closed")
                      : `${effectiveHours.open_time?.slice(0, 5)}-${effectiveHours.close_time?.slice(0, 5)}`}
                  </p>
                </div>

                {isClosed ? (
                  <div className="flex min-h-[132px] items-center justify-center border border-border bg-background/40 px-4 text-center">
                    <p className="font-admin-primary text-sm uppercase tracking-[0.22em] text-foreground-muted">
                      {effectiveHours.reason || uiText("Closed")}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <div className="relative min-w-[680px] border border-border bg-background/40">
                      <div
                        className="grid"
                        style={{
                          gridTemplateColumns: `96px repeat(${laneCount}, minmax(0, 1fr))`,
                        }}
                      >
                        {Array.from({ length: slotCount + 1 }, (_, index) => {
                          const minutes = timelineStart! + index * SLOT_MINUTES;
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

                      {dayAppointments.map((appointment) => {
                        const top = ((appointment.startMinutes - timelineStart!) / SLOT_MINUTES) * 52 + 1;
                        const height =
                          ((appointment.endMinutes - appointment.startMinutes) / SLOT_MINUTES) * 52 - 4;
                        const laneWidth = `calc((100% - 96px) / ${laneCount})`;

                        return (
                          <button
                            key={appointment.id}
                              data-appointment-id={appointment.id}
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
                )}
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
                      {formatDateHeading(dateKey, locale)}
                    </p>
                    <p className="font-admin-primary text-xs uppercase tracking-[0.2em] text-foreground-secondary">
                      {effectiveHours.is_closed
                        ? effectiveHours.reason || uiText("Closed")
                        : `${effectiveHours.open_time?.slice(0, 5)}-${effectiveHours.close_time?.slice(0, 5)}`}
                    </p>
                  </div>
                  <p className="font-admin-primary text-xs uppercase tracking-[0.18em] text-foreground-muted">
                    {audit("appointmentCount", { count: dayAppointments.length })}
                  </p>
                </div>

                {dayAppointments.length === 0 ? (
                  <p className="pt-4 font-admin-primary text-sm leading-6 text-foreground-secondary">
                    {ui("m05c99d237ac4")}</p>
                ) : (
                  <div className="divide-y divide-border">
                    {dayAppointments.map((appointment) => (
                      <button
                        key={appointment.id}
                              data-appointment-id={appointment.id}
                        type="button"
                        onClick={() => setSelectedAppointmentId(appointment.id)}
                        className="grid w-full grid-cols-1 gap-3 py-4 text-left transition-colors hover:bg-background/40 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto_auto]"
                      >
                        <div>
                          <p className="font-admin-display text-xl uppercase tracking-[-0.04em] text-foreground">
                            {appointment.customer_name}
                          </p>
                          <p className="font-admin-primary text-xs uppercase tracking-[0.18em] text-foreground-muted">
                            {uiText(appointment.booking_type === "customer" ? "Registered customer" : "Guest booking")}
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
                          {uiText(appointment.booking_type)}
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

      <RecurringBookingManager
        mode="admin"
        services={services.map((service) => ({ id: service.id, name: service.name }))}
        customers={customers}
        series={recurringBookings}
      />

      {selectedDetail ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center overflow-hidden bg-background/80 px-3 backdrop-blur-sm sm:px-6"
          style={{
            paddingTop: "max(12px, env(safe-area-inset-top))",
            paddingBottom: "max(12px, env(safe-area-inset-bottom))",
          }}
        >
          <div className="w-full max-w-2xl max-h-[calc(100dvh-24px)] overflow-y-auto overscroll-contain border border-border bg-surface px-5 py-6 [scrollbar-color:rgba(198,158,102,0.35)_transparent] [scrollbar-width:thin] sm:px-6 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-accent/30 [&::-webkit-scrollbar-track]:bg-transparent">
            <div className="sticky -top-6 z-20 -mx-5 -mt-6 flex items-start justify-between gap-4 border-b border-border bg-surface px-5 pb-4 pt-6 sm:-mx-6 sm:px-6">
              <div className="space-y-2">
                <p className="font-admin-primary text-xs uppercase tracking-[0.34em] text-foreground-secondary">
                  {ui("m2d05c593246b")}</p>
                <h2 ref={detailHeading} tabIndex={-1} className="font-admin-display text-2xl uppercase tracking-[-0.04em] text-foreground outline-none sm:text-3xl">
                  {selectedDetail.customer_name}
                </h2>
                <p className="font-admin-primary text-sm leading-7 text-foreground-secondary">
                  {selectedDetail.service_name} • {formatDateForLocale(selectedDetail.start_at, locale)} • {selectedDetail.time_label}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAppointmentId(null)}
                className="inline-flex h-11 w-11 items-center justify-center border border-border text-foreground-secondary transition-colors hover:bg-background hover:text-foreground"
                aria-label={ui("m55e8351eb6c2")}
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="border border-border bg-background/40 px-4 py-4">
                <p className="font-admin-primary text-xs uppercase tracking-[0.18em] text-foreground-muted">
                  {ui("mb37456c4530b")}</p>
                <p className="mt-2 font-admin-display text-xl uppercase tracking-[-0.04em] text-foreground">
                  {selectedDetail.customer_name}
                </p>
                <p className="mt-2 font-admin-primary text-sm text-foreground-secondary">
                  {selectedDetail.customer_email || uiText("No email")}
                </p>
                <p className="mt-1 font-admin-primary text-sm text-foreground-secondary">
                  {selectedDetail.customer_phone || uiText("No phone")}
                </p>
                <p className="mt-3 font-admin-primary text-xs uppercase tracking-[0.18em] text-foreground-muted">
                  {uiText(selectedDetail.booking_type === "customer" ? "Registered customer" : "Guest")}
                </p>
              </div>

              <div className="border border-border bg-background/40 px-4 py-4">
                <p className="font-admin-primary text-xs uppercase tracking-[0.18em] text-foreground-muted">
                  {ui("m0a8adac9d6d5")}</p>
                <p className="mt-2 font-admin-primary text-sm text-foreground-secondary">
                  {ui("m81b7d2ea42df")}{formatDateForLocale(selectedDetail.start_at, locale)}
                </p>
                <p className="mt-1 font-admin-primary text-sm text-foreground-secondary">
                  {ui("m1c7c77b27543")}{formatZurichTime(selectedDetail.start_at)}
                </p>
                <p className="mt-1 font-admin-primary text-sm text-foreground-secondary">
                  {ui("mb8ce37a1915f")}{formatZurichTime(selectedDetail.end_at)}
                </p>
                <p className="mt-3 font-admin-primary text-xs uppercase tracking-[0.18em] text-foreground-muted">
                  {ui("m11dc9e195292")}{STATUS_LABELS[selectedDetail.status]}
                </p>
              </div>
            </div>

            {selectedFinanceAppointment ? (
              <div className="mt-4 border border-border bg-background/40 px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-admin-primary text-xs uppercase tracking-[0.18em] text-foreground-muted">{ui("mb41a92bed032")}</p>
                    <p className="mt-2 font-admin-display text-xl uppercase text-foreground">{uiText(selectedFinanceAppointment.paymentStatus.replaceAll("_", " "))}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-right font-admin-primary text-xs sm:grid-cols-3">
                    <span><b className="block text-foreground-muted">{ui("mc0a8060f3b11")}</b>CHF {selectedFinanceAppointment.originalPrice.toFixed(2)}</span>
                    <span><b className="block text-foreground-muted">{ui("mb524936d7aa1")}</b>−CHF {selectedFinanceAppointment.discountAmount.toFixed(2)}</span>
                    <span><b className="block text-foreground-muted">{ui("m672b22cc516e")}</b>CHF {selectedFinanceAppointment.amountDue.toFixed(2)}</span>
                    <span><b className="block text-foreground-muted">{ui("mdc9d4584a554")}</b>CHF {selectedFinanceAppointment.netPaid.toFixed(2)}</span>
                    <span className="text-accent"><b className="block text-foreground-muted">{ui("mcc632b5e2fd2")}</b>CHF {Math.max(0, selectedFinanceAppointment.amountDue - selectedFinanceAppointment.netPaid).toFixed(2)}</span>
                  </div>
                </div>
                {selectedFinanceAppointment.discountSource ? <p className="mt-3 font-admin-primary text-xs text-foreground-secondary">{uiText(selectedFinanceAppointment.discountSource === "manual" ? "Manual discount" : selectedFinanceAppointment.discountSource === "loyalty" ? "Loyalty reward" : "Promotion")} — {selectedFinanceAppointment.discountLabel ?? uiText("Discount")}</p> : null}
                {selectedDetail.status === "completed" && selectedFinanceAppointment.netPaid < selectedFinanceAppointment.amountDue ? <p className="mt-3 font-admin-primary text-xs uppercase tracking-[0.14em] text-rose-300">{ui("m8939677355da")}</p> : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  {selectedSale ? <>
                    <span className="inline-flex min-h-11 items-center justify-center border border-emerald-400/40 px-4 font-admin-primary text-xs uppercase tracking-[0.18em] text-emerald-300">{ui("mdc9d4584a554")}</span>
                    <Link href={`/admin/finance/sales?saleId=${encodeURIComponent(selectedSale.id)}`} className="inline-flex min-h-11 items-center justify-center bg-accent px-4 font-admin-primary text-xs uppercase tracking-[0.18em] text-background">{ui("mbd1f146972c6")}</Link>
                    {selectedSale.refundableAmount > 0 ? <Link href={`/admin/finance/sales?saleId=${encodeURIComponent(selectedSale.id)}&refund=1`} className="inline-flex min-h-11 items-center justify-center border border-accent/60 px-4 font-admin-primary text-xs uppercase tracking-[0.18em] text-accent">{ui("m7b02e80087ff")}</Link> : null}
                  </> : (
                    <button type="button" onClick={() => setIsCheckoutOpen(true)} className="inline-flex min-h-11 items-center justify-center bg-accent px-4 font-admin-primary text-xs uppercase tracking-[0.18em] text-background">{ui("m3ac8e9e58c5a")}</button>
                  )}
                </div>
              </div>
            ) : null}

            <div className="mt-4 border border-border bg-background/40 px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-admin-primary text-xs uppercase tracking-[0.18em] text-foreground-muted">{ui("mf6ce3b6fcfca")}</p>
                  {selectedReceipt ? <><p className="mt-2 font-admin-display text-xl uppercase text-foreground">{uiText("Receipt")} {selectedReceipt.receipt_number}</p><p className="mt-1 font-admin-primary text-xs text-foreground-secondary">{ui("mdeb5d5e2f038")}{" "}{new Intl.DateTimeFormat(intlLocale(locale), { timeZone: "Europe/Zurich", dateStyle: "medium", timeStyle: "short" }).format(new Date(selectedReceipt.issued_at))}</p></> : <p className="mt-2 font-admin-primary text-sm text-foreground-secondary">{ui("m9526c43fe6f5")}</p>}
                </div>
                {selectedReceipt ? <div className="text-right font-admin-primary text-xs"><p className="text-lg text-foreground">CHF {selectedReceipt.total.toFixed(2)}</p><p className={selectedReceipt.emailed_at ? "mt-1 text-emerald-300" : "mt-1 text-foreground-muted"}>{uiText(selectedReceipt.emailed_at ? "Emailed" : "Not emailed")}</p></div> : null}
              </div>
              {selectedReceipt ? <div className="mt-4 flex flex-wrap gap-2"><a href={`/api/admin/receipts/${selectedReceipt.id}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 border border-border px-4 font-admin-primary text-[10px] uppercase tracking-[0.14em] text-foreground-secondary hover:text-accent"><Eye size={14}/>{ui("m94c8c4b5ab07")}</a><a href={`/api/admin/receipts/${selectedReceipt.id}?format=pdf`} className="inline-flex min-h-11 items-center justify-center gap-2 border border-border px-4 font-admin-primary text-[10px] uppercase tracking-[0.14em] text-foreground-secondary hover:text-accent"><Download size={14}/>{ui("m98e5ef062b2a")}</a><button type="button" disabled={isReceiptPending || !selectedDetail.customer_email?.trim()} onClick={emailReceipt} className="inline-flex min-h-11 items-center justify-center gap-2 border border-accent/50 px-4 font-admin-primary text-[10px] uppercase tracking-[0.14em] text-accent disabled:cursor-not-allowed disabled:opacity-35"><Mail size={14}/>{uiText(isReceiptPending ? "Sending..." : selectedReceipt.emailed_at ? "Resend" : "Send to Customer")}</button></div> : selectedFinanceAppointment && selectedFinanceAppointment.netPaid >= selectedFinanceAppointment.amountDue ? <button type="button" disabled={isReceiptPending} onClick={generateReceipt} className="mt-4 inline-flex min-h-11 items-center justify-center bg-accent px-4 font-admin-primary text-xs uppercase tracking-[0.16em] text-background disabled:opacity-40">{uiText(isReceiptPending ? "Generating..." : "Generate Receipt")}</button> : <p className="mt-3 font-admin-primary text-xs text-foreground-muted">{ui("m83f52c500d68")}</p>}
              {selectedReceipt && !selectedDetail.customer_email?.trim() ? <p className="mt-3 font-admin-primary text-xs text-foreground-muted">{ui("m58f0278644a9")}</p> : null}
              {selectedReceipt?.payment_method === null && selectedReceipt.total === 0 ? <p className="mt-3 font-admin-primary text-xs uppercase tracking-[0.14em] text-accent">{ui("m36e7fd70214c")}</p> : null}
              {receiptFeedback ? <p className="mt-3 font-admin-primary text-sm text-foreground-secondary">{uiText(receiptFeedback)}</p> : null}
            </div>

            {notificationHistory ? <p role="status" className="mt-6 text-sm text-accent">{history("readOnly")}</p> : <>
            <div className="mt-6 space-y-3">
              <label className="block">
                <span className="font-admin-primary text-xs uppercase tracking-[0.18em] text-foreground-muted">
                  {ui("m70440046a3dc")}</span>
                <textarea
                  value={draftNotes}
                  onChange={(event) => setDraftNotes(event.target.value)}
                  rows={5}
                  className="mt-2 w-full border border-border bg-background px-4 py-3 font-admin-primary text-sm text-foreground outline-none transition-colors placeholder:text-foreground-muted focus:border-foreground-secondary"
                  placeholder={ui("m00e8e5b51e5c")}
                />
              </label>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={isPending}
                onClick={openEditModal}
                className="inline-flex min-h-11 items-center justify-center border border-border px-4 font-admin-primary text-xs uppercase tracking-[0.18em] text-foreground-secondary transition-colors hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:text-foreground-muted"
              >
                {ui("m5301648dcf6b")}</button>
              {(["confirmed", "completed", "cancelled", "no_show"] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  disabled={isPending}
                  onClick={() => saveAppointment({ status, notes: draftNotes })}
                  className="inline-flex min-h-11 items-center justify-center border border-border px-4 font-admin-primary text-xs uppercase tracking-[0.18em] text-foreground-secondary transition-colors hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:text-foreground-muted"
                >
                  {ui("m31e9697d43a1")}{STATUS_LABELS[status]}
                </button>
              ))}
              <button
                type="button"
                disabled={isPending}
                onClick={() => saveAppointment({ notes: draftNotes })}
                className="inline-flex min-h-11 items-center justify-center border border-border bg-accent px-4 font-admin-primary text-xs uppercase tracking-[0.18em] text-background transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-background-secondary disabled:text-foreground-muted"
              >
                {ui("m57e55b2b2b4b")}</button>
              <button
                type="button"
                disabled={isPending}
                onClick={openRemoveModal}
                className="inline-flex min-h-11 items-center justify-center border border-rose-500/40 px-4 font-admin-primary text-xs uppercase tracking-[0.18em] text-rose-200 transition-colors hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:text-foreground-muted"
              >
                {uiText(selectedDetail.recurring_booking_id ? "Remove This Appointment" : "Remove Appointment")}
              </button>
            </div>

            </>}
            {feedback ? (
              <p className="mt-4 font-admin-primary text-sm text-foreground-secondary">
                {uiText(feedback)}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {isEditOpen && selectedDetail && editForm ? (
        <div className="fixed inset-0 z-[95] flex items-end justify-center bg-background/80 p-4 backdrop-blur-sm sm:items-center sm:p-6">
          <div className="admin-scrollbar max-h-[calc(100dvh-24px)] w-full max-w-2xl overflow-y-auto overscroll-contain border border-border bg-surface px-5 py-6 pb-[max(20px,env(safe-area-inset-bottom))] sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <p className="font-admin-primary text-xs uppercase tracking-[0.34em] text-foreground-secondary">
                  {ui("m1f3f4957c553")}</p>
                <h2 className="font-admin-display text-2xl uppercase tracking-[-0.04em] text-foreground sm:text-3xl">
                  {ui("m3ebd6c11986a")}</h2>
                <p className="font-admin-primary text-sm leading-7 text-foreground-secondary">
                  {ui("m038c5ee1fb81")}</p>
              </div>
              <button
                type="button"
                onClick={closeEditModal}
                className="inline-flex h-11 w-11 items-center justify-center border border-border text-foreground-secondary transition-colors hover:bg-background hover:text-foreground"
                aria-label={ui("m108a70bd1eea")}
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
              <div className="space-y-4">
                <div className="border border-border bg-background/35 px-4 py-4">
                  <p className="font-admin-display text-xl uppercase tracking-[-0.04em] text-foreground">
                    {selectedDetail.customer_name}
                  </p>
                  <p className="mt-2 font-admin-primary text-sm text-foreground-secondary">
                    {selectedDetail.customer_email || uiText("No email")} • {selectedDetail.customer_phone || uiText("No phone")}
                  </p>
                </div>

                <AdminSelect label={ui("m329cb8b6ba8c")} value={editForm.serviceId} onChange={(value) => setEditForm((current) => current ? { ...current, serviceId: value } : current)} options={services.map((service) => ({ value: service.id, label: `${service.name} · ${service.duration_max ?? service.duration_min} min · ${formatServicePrice(service.price)}` }))} searchable={services.length > 8} />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <DateTimePicker mode="date" label={ui("meb9a4bc1c0c1")} value={editForm.dateKey} onChange={(nextDate) => setEditForm((current) => current ? { ...current, dateKey: nextDate } : current)} />
                  <AdminSelect label={ui("m6c82e6dd8680")} value={editForm.startTime} onChange={(value) => setEditForm((current) => current ? { ...current, startTime: value } : current)} disabled={isEditPending} options={editAvailableSlots.map((slot) => ({ value: slot.time, label: slot.time }))} />
                </div>
              </div>

              <div className="space-y-4">
                <label className="space-y-2">
                  <span className="font-admin-primary text-[11px] uppercase tracking-[0.2em] text-foreground-muted">
                    {ui("m70440046a3dc")}</span>
                  <textarea
                    rows={6}
                    value={editForm.notes}
                    onChange={(event) =>
                      setEditForm((current) =>
                        current ? { ...current, notes: event.target.value } : current,
                      )
                    }
                    className="w-full resize-none border border-border bg-transparent px-4 py-3 font-admin-primary text-sm text-foreground outline-none transition-colors placeholder:text-foreground-muted focus:border-foreground-secondary"
                    placeholder={ui("m00e8e5b51e5c")}
                  />
                </label>

                <label className="inline-flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={editForm.sendNotification}
                    onChange={(event) =>
                      setEditForm((current) =>
                        current ? { ...current, sendNotification: event.target.checked } : current,
                      )
                    }
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  <span className="font-admin-primary text-sm uppercase tracking-[0.18em] text-foreground-secondary">
                    {ui("m2382412deef2")}</span>
                </label>

                {editSlotsError ? (
                  <div className="border border-border bg-background/35 px-4 py-3">
                    <p className="font-admin-primary text-sm text-foreground-secondary">
                      {uiText(editSlotsError)}
                    </p>
                  </div>
                ) : null}

                {editFeedback ? (
                  <div className="border border-border bg-background/35 px-4 py-3">
                    <p className="font-admin-primary text-sm text-foreground-secondary">
                      {uiText(editFeedback)}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeEditModal}
                className="inline-flex min-h-12 items-center justify-center border border-border px-5 py-3 font-admin-primary text-sm uppercase tracking-[0.18em] text-foreground-secondary transition-colors hover:bg-background hover:text-foreground"
              >
                {ui("m77dfd2135f4d")}</button>
              <button
                type="button"
                disabled={isEditPending}
                onClick={submitEditAppointment}
                className="inline-flex min-h-12 items-center justify-center border border-border bg-accent px-5 py-3 font-admin-primary text-sm uppercase tracking-[0.18em] text-background transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-background-secondary disabled:text-foreground-muted"
              >
                {uiText(isEditPending ? "Saving..." : "Save Changes")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isCheckoutOpen && selectedFinanceAppointment ? (
        <CheckoutDialog
          appointment={selectedFinanceAppointment}
          promotions={promotions}
          enabledPaymentMethods={enabledPaymentMethods}
          onClose={() => setIsCheckoutOpen(false)}
        />
      ) : null}

      {isRemoveOpen && selectedDetail ? (
        <div className="fixed inset-0 z-[95] flex items-end justify-center bg-background/80 p-4 backdrop-blur-sm sm:items-center sm:p-6">
          <div className="admin-scrollbar max-h-[calc(100dvh-24px)] w-full max-w-xl overflow-y-auto overscroll-contain border border-border bg-surface px-5 py-6 pb-[max(20px,env(safe-area-inset-bottom))] sm:px-6">
            <div className="space-y-2">
              <p className="font-admin-primary text-xs uppercase tracking-[0.34em] text-foreground-secondary">
                {ui("m1f3f4957c553")}</p>
              <h2 className="font-admin-display text-2xl uppercase tracking-[-0.04em] text-foreground sm:text-3xl">
                {uiText(selectedDetail.recurring_booking_id ? "Remove This Appointment" : "Remove Appointment")}
              </h2>
              <p className="font-admin-primary text-sm leading-7 text-foreground-secondary">
                {uiText(selectedDetail.recurring_booking_id
                  ? "This permanently removes only this future appointment. The recurring series and later appointments remain active."
                  : "This permanently removes the appointment. You can optionally notify the customer by email.")}
              </p>
            </div>

            <div className="mt-6 border border-border bg-background/35 px-4 py-4">
              <p className="font-admin-display text-xl uppercase tracking-[-0.04em] text-foreground">
                {selectedDetail.customer_name}
              </p>
              <p className="mt-2 font-admin-primary text-sm text-foreground-secondary">
                {selectedDetail.service_name} • {formatDateForLocale(selectedDetail.start_at, locale)} • {selectedDetail.time_label}
              </p>
            </div>

            {!selectedDetail.recurring_booking_id ? <label className="mt-6 inline-flex items-center gap-3">
              <input
                type="checkbox"
                checked={sendCancellationEmail}
                onChange={(event) => setSendCancellationEmail(event.target.checked)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              <span className="font-admin-primary text-sm uppercase tracking-[0.18em] text-foreground-secondary">
                {ui("md6aabf15e825")}</span>
            </label> : null}

            {removeFeedback ? (
              <div className="mt-4 border border-border bg-background/35 px-4 py-3">
                <p className="font-admin-primary text-sm text-foreground-secondary">
                  {uiText(removeFeedback)}
                </p>
              </div>
            ) : null}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeRemoveModal}
                className="inline-flex min-h-12 items-center justify-center border border-border px-5 py-3 font-admin-primary text-sm uppercase tracking-[0.18em] text-foreground-secondary transition-colors hover:bg-background hover:text-foreground"
              >
                {ui("m77dfd2135f4d")}</button>
              <button
                type="button"
                disabled={isPending}
                onClick={removeAppointment}
                className="inline-flex min-h-12 items-center justify-center border border-rose-500/40 px-5 py-3 font-admin-primary text-sm uppercase tracking-[0.18em] text-rose-200 transition-colors hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:text-foreground-muted"
              >
                {uiText(isPending ? "Removing..." : selectedDetail.recurring_booking_id ? "Remove This Appointment" : "Remove Appointment")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isCreateOpen ? (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-background/80 p-4 backdrop-blur-sm sm:items-center sm:p-6">
          <div className="admin-scrollbar max-h-[calc(100dvh-24px)] w-full max-w-3xl overflow-y-auto overscroll-contain border border-border bg-surface px-5 py-6 pb-[max(20px,env(safe-area-inset-bottom))] sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <p className="font-admin-primary text-xs uppercase tracking-[0.34em] text-foreground-secondary">
                  {ui("m1f3f4957c553")}</p>
                <h2 className="font-admin-display text-2xl uppercase tracking-[-0.04em] text-foreground sm:text-3xl">
                  {ui("mf1be0cbfac1d")}</h2>
                <p className="font-admin-primary text-sm leading-7 text-foreground-secondary">
                  {ui("m759a2c0a94ef")}</p>
              </div>
              <button
                type="button"
                onClick={closeCreateModal}
                className="inline-flex h-11 w-11 items-center justify-center border border-border text-foreground-secondary transition-colors hover:bg-background hover:text-foreground"
                aria-label={ui("mb0ea3b610d10")}
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
              <div className="space-y-4">
                <label className="space-y-2">
                  <span className="font-admin-primary text-[11px] uppercase tracking-[0.2em] text-foreground-muted">
                    {ui("mda75dbdb6175")}</span>
                  <input
                    type="text"
                    value={createForm.customerSearch}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        customerId: null,
                        customerSearch: event.target.value,
                      }))
                    }
                    className="w-full border border-border bg-transparent px-4 py-3 font-admin-primary text-sm text-foreground outline-none transition-colors placeholder:text-foreground-muted focus:border-foreground-secondary"
                    placeholder={ui("m5c5f3caabd40")}
                  />
                </label>

                <div className="max-h-52 space-y-2 overflow-y-auto border border-border bg-background/35 p-2">
                  {filteredCustomers.map((customer) => (
                    <button
                      key={customer.id}
                      type="button"
                      onClick={() => selectCustomer(customer)}
                      className="block w-full border border-border bg-surface px-4 py-3 text-left transition-colors hover:bg-background"
                    >
                      <p className="font-admin-display text-lg uppercase tracking-[-0.04em] text-foreground">
                        {customer.full_name}
                      </p>
                      <p className="font-admin-primary text-sm text-foreground-secondary">
                        {customer.email || uiText("No email")} • {customer.phone || uiText("No phone")}
                      </p>
                    </button>
                  ))}
                  {filteredCustomers.length === 0 ? (
                    <p className="px-3 py-4 font-admin-primary text-sm text-foreground-secondary">
                      {ui("m9b4c1adba58d")}</p>
                  ) : null}
                </div>

                <label className="space-y-2">
                  <span className="font-admin-primary text-[11px] uppercase tracking-[0.2em] text-foreground-muted">
                    {ui("m75636316f9d7")}</span>
                  <input
                    type="text"
                    value={createForm.customerName}
                    onChange={(event) =>
                      setCreateForm((current) => ({ ...current, customerName: event.target.value }))
                    }
                    className="w-full border border-border bg-transparent px-4 py-3 font-admin-primary text-sm text-foreground outline-none transition-colors focus:border-foreground-secondary"
                  />
                </label>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="space-y-2">
                    <span className="font-admin-primary text-[11px] uppercase tracking-[0.2em] text-foreground-muted">
                      {ui("m5a4bc8d69307")}</span>
                    <input
                      type="email"
                      placeholder={ui("mc7c84c81ff57")} value={createForm.customerEmail}
                      onChange={(event) =>
                        setCreateForm((current) => ({ ...current, customerEmail: event.target.value }))
                      }
                      className="w-full border border-border bg-transparent px-4 py-3 font-admin-primary text-sm text-foreground outline-none transition-colors focus:border-foreground-secondary"
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="font-admin-primary text-[11px] uppercase tracking-[0.2em] text-foreground-muted">
                      {ui("m268cb76567b5")}</span>
                    <input
                      type="tel"
                      placeholder={ui("mfce04b27cbd2")} value={createForm.customerPhone}
                      onChange={(event) =>
                        setCreateForm((current) => ({ ...current, customerPhone: event.target.value }))
                      }
                      className="w-full border border-border bg-transparent px-4 py-3 font-admin-primary text-sm text-foreground outline-none transition-colors focus:border-foreground-secondary"
                    />
                  </label>
                </div>
              </div>

              <div className="space-y-4">
                <AdminSelect label={ui("m329cb8b6ba8c")} value={createForm.serviceId} onChange={(value) => setCreateForm((current) => ({ ...current, serviceId: value }))} placeholder={ui("mf216b2305e94")} options={services.map((service) => ({ value: service.id, label: `${service.name} · ${service.duration_max ?? service.duration_min} min · ${formatServicePrice(service.price)}` }))} searchable={services.length > 8} />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <DateTimePicker mode="date" label={ui("meb9a4bc1c0c1")} value={createForm.dateKey} onChange={(nextDate) => setCreateForm((current) => ({ ...current, dateKey: nextDate }))} />
                  <AdminSelect label={ui("m6c82e6dd8680")} value={createForm.startTime} onChange={(value) => setCreateForm((current) => ({ ...current, startTime: value }))} disabled={!createForm.serviceId || !createForm.dateKey || isCreatePending} placeholder={uiText(isCreatePending ? "Loading..." : "Select available time")} options={availableSlots.map((slot) => ({ value: slot.time, label: slot.time }))} />
                </div>

                {selectedService ? (
                  <div className="border border-border bg-background/35 px-4 py-4">
                    <p className="font-admin-display text-xl uppercase tracking-[-0.04em] text-foreground">
                      {selectedService.name}
                    </p>
                    <p className="mt-2 font-admin-primary text-sm text-foreground-secondary">
                      {ui("m1370004da76f")}{selectedService.duration_max ?? selectedService.duration_min} min • {formatServicePrice(selectedService.price)}
                    </p>
                  </div>
                ) : null}

                {slotsError ? (
                  <div className="border border-border bg-background/35 px-4 py-3">
                    <p className="font-admin-primary text-sm text-foreground-secondary">{uiText(slotsError)}</p>
                  </div>
                ) : null}

                <label className="space-y-2">
                  <span className="font-admin-primary text-[11px] uppercase tracking-[0.2em] text-foreground-muted">
                    {ui("m70440046a3dc")}</span>
                  <textarea
                    rows={5}
                    value={createForm.notes}
                    onChange={(event) =>
                      setCreateForm((current) => ({ ...current, notes: event.target.value }))
                    }
                    className="w-full resize-none border border-border bg-transparent px-4 py-3 font-admin-primary text-sm text-foreground outline-none transition-colors placeholder:text-foreground-muted focus:border-foreground-secondary"
                    placeholder={ui("m00e8e5b51e5c")}
                  />
                </label>

                <label className="inline-flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={createForm.sendConfirmationEmail}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        sendConfirmationEmail: event.target.checked,
                      }))
                    }
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  <span className="font-admin-primary text-sm uppercase tracking-[0.18em] text-foreground-secondary">
                    {ui("m0f23e14aab75")}</span>
                </label>

                {createFeedback ? (
                  <div className="border border-border bg-background/35 px-4 py-3">
                    <p className="font-admin-primary text-sm text-foreground-secondary">{uiText(createFeedback)}</p>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeCreateModal}
                className="inline-flex min-h-12 items-center justify-center border border-border px-5 py-3 font-admin-primary text-sm uppercase tracking-[0.18em] text-foreground-secondary transition-colors hover:bg-background hover:text-foreground"
              >
                {ui("m77dfd2135f4d")}</button>
              <button
                type="button"
                disabled={isCreatePending}
                onClick={submitCreateAppointment}
                className="inline-flex min-h-12 items-center justify-center border border-border bg-accent px-5 py-3 font-admin-primary text-sm uppercase tracking-[0.18em] text-background transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-background-secondary disabled:text-foreground-muted"
              >
                {uiText(isCreatePending ? "Creating..." : "Create Appointment")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
