"use client";

import type {
  Dispatch,
  ReactNode,
  SetStateAction,
} from "react";
import { useCallback, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { bookAppointment } from "@/app/actions/appointments";
import {
  groupTimeSlots,
  type BookingDateOption,
  type TimeGroup,
} from "@/lib/public/booking-availability-utils";

type Service = {
  id: string;
  title: string;
  description: string;
  duration: string;
  durationMinutes: number;
  price: string;
  originalPrice: number;
  finalPrice: number;
  discountAmount: number;
  discountType: "percentage" | "fixed" | null;
  discountValue: number | null;
  promotionId: string | null;
  promotionName: string | null;
  image_url: string | null;
};
type BookingDate = BookingDateOption;

type BookingState = {
  serviceId: string | null;
  dateId: string | null;
  time: string | null;
  bookingMode: "account" | "guest";
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  note: string;
  marketingEmailConsent: boolean;
};

type StepProps = {
  state: BookingState;
  setState: Dispatch<SetStateAction<BookingState>>;
  selectedService: Service | null;
  selectedDate: BookingDate | null;
  onBack: () => void;
  onNext: () => void;
};

const stepLabels = [
  ["01", "Service"],
  ["02", "Time"],
  ["03", "Details"],
  ["04", "Review"],
] as const;

function StepButton({
  children,
  disabled,
  onClick,
  variant = "primary",
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  variant?: "primary" | "secondary";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-12 items-center justify-center border px-4 py-3 text-center font-primary text-xs uppercase tracking-[0.18em] transition-colors sm:text-sm ${
        variant === "primary"
          ? "border-border bg-accent text-background hover:bg-accent-hover disabled:border-border disabled:bg-surface disabled:text-foreground-muted"
          : "border-border bg-transparent text-foreground-secondary hover:border-foreground-secondary hover:text-foreground disabled:text-foreground-muted"
      } ${disabled ? "cursor-not-allowed" : ""}`}
    >
      {children}
    </button>
  );
}

function BookingProgress({ step }: { step: number }) {
  return (
    <div className="grid grid-cols-4 gap-2 border-b border-border pb-6 sm:gap-3">
      {stepLabels.map(([index, label], itemIndex) => {
        const isActive = itemIndex === step;
        const isComplete = itemIndex < step;

        return (
          <div key={index} className="space-y-3">
            <div className="flex items-center justify-between">
              <span
                className={`font-primary text-[10px] uppercase tracking-[0.24em] sm:text-[11px] sm:tracking-[0.3em] ${
                  isActive || isComplete
                    ? "text-foreground"
                    : "text-foreground-muted"
                }`}
              >
                {index}
              </span>
            </div>
            <p
              className={`font-primary text-[10px] uppercase tracking-[0.18em] sm:text-[11px] sm:tracking-[0.24em] ${
                isActive
                  ? "text-foreground-secondary"
                  : isComplete
                    ? "text-foreground"
                    : "text-foreground-muted"
              }`}
            >
              {label}
            </p>
            <div className="h-px w-full bg-border">
              <div
                className={`h-full transition-all duration-300 ease-out ${
                  isActive || isComplete
                    ? "w-full bg-accent"
                    : "w-0 bg-accent"
                }`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BookingSummary({
  service,
  date,
  time,
}: {
  service: Service | null;
  date: BookingDate | null;
  time: string | null;
}) {
  const parts = [
    service?.title.toUpperCase(),
    date ? `${date.day} ${date.date} ${date.month}` : null,
    time,
  ].filter(Boolean);

  if (parts.length === 0) {
    return null;
  }

  return (
    <p className="font-primary text-xs uppercase tracking-[0.24em] text-foreground-muted">
      {parts.join(" · ")}
    </p>
  );
}

function formatPrice(value: number) {
  return `CHF ${value.toFixed(value % 1 === 0 ? 0 : 2)}`;
}

function ServicePrice({ service, compact = false }: { service: Service; compact?: boolean }) {
  if (!service.promotionId) return <span className="font-primary text-sm uppercase tracking-[0.2em] text-foreground-secondary">{service.price}</span>;
  const badge = service.discountType === "percentage" ? `${service.discountValue}% OFF` : `CHF ${service.discountValue} OFF`;
  return <span className={`flex ${compact ? "items-center" : "items-end"} flex-wrap gap-2`}><span className="font-primary text-xs uppercase tracking-[0.16em] text-foreground-muted line-through">{formatPrice(service.originalPrice)}</span><span className="border border-accent/50 bg-accent/10 px-2 py-1 font-primary text-[9px] font-semibold uppercase tracking-[0.16em] text-accent">{badge}</span><span className="font-display text-2xl uppercase text-foreground">{formatPrice(service.finalPrice)}</span>{compact ? null : <span className="basis-full font-primary text-[10px] uppercase tracking-[0.18em] text-accent">Your promotional price</span>}</span>;
}

function ServiceStep({
  services,
  state,
  setState,
  onNext,
}: Pick<StepProps, "state" | "setState" | "onNext"> & {
  services: Service[];
}) {
  return (
    <div className="space-y-8 animate-[booking-panel-in_320ms_cubic-bezier(0.22,1,0.36,1)]">
      <div className="space-y-3">
        <h3 className="font-display text-3xl font-semibold uppercase leading-none tracking-[-0.04em] text-foreground sm:text-4xl">
          Choose Your Service
        </h3>
      </div>

      <div className="border-t border-border">
        {services.map((service) => {
          const isSelected = state.serviceId === service.id;

          return (
            <button
              key={service.id}
              type="button"
              onClick={() =>
                setState((current) => ({
                  ...current,
                  serviceId: service.id,
                }))
              }
              aria-pressed={isSelected}
              className={`group relative flex w-full cursor-pointer items-start justify-between gap-4 border-b px-4 py-5 text-left transition-colors sm:py-6 ${
                isSelected
                  ? "border-accent/60 bg-background text-foreground"
                  : "border-border text-foreground-secondary hover:bg-background/70 hover:text-foreground"
              }`}
            >
              <span
                className={`absolute inset-y-0 left-0 w-px transition-colors ${
                  isSelected ? "bg-accent" : "bg-transparent"
                }`}
                aria-hidden="true"
              />
              <div className="space-y-2">
                <div className="flex items-baseline gap-4">
                  <span
                    className={`font-display text-2xl uppercase tracking-[-0.04em] transition-colors sm:text-3xl ${
                      isSelected
                        ? "text-foreground"
                        : "text-foreground-secondary group-hover:text-foreground"
                    }`}
                  >
                    {service.title}
                  </span>
                  <span
                    className={`font-primary text-sm uppercase tracking-[0.2em] transition-colors ${
                      isSelected
                        ? "text-foreground-secondary"
                        : "text-foreground-muted group-hover:text-foreground-secondary"
                    }`}
                  >
                    <ServicePrice service={service} compact />
                  </span>
                </div>
                <p
                  className={`font-primary text-sm leading-6 transition-colors ${
                    isSelected
                      ? "text-foreground-secondary"
                      : "text-foreground-muted group-hover:text-foreground-secondary"
                  }`}
                >
                  {service.description}
                </p>
                <p
                  className={`font-primary text-xs uppercase tracking-[0.24em] transition-colors ${
                    isSelected
                      ? "text-foreground-secondary"
                      : "text-foreground-muted"
                  }`}
                >
                  {service.duration}
                </p>
              </div>

              <span
                className={`mt-1 inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] transition-colors ${
                  isSelected
                    ? "border-accent bg-accent text-background"
                    : "border-border text-transparent group-hover:border-foreground-secondary"
                }`}
                aria-hidden="true"
              >
                •
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex justify-end">
        <StepButton
          onClick={onNext}
          disabled={!state.serviceId}
        >
          Continue →
        </StepButton>
      </div>
    </div>
  );
}

function DateTimeStep({
  dates,
  timeGroups,
  state,
  setState,
  onBack,
  onNext,
}: Pick<StepProps, "state" | "setState" | "onBack" | "onNext"> & {
  dates: BookingDate[];
  timeGroups: TimeGroup[];
}) {
  const hasAvailableDates = dates.some((date) => date.isAvailable);

  return (
    <div className="space-y-8 animate-[booking-panel-in_320ms_cubic-bezier(0.22,1,0.36,1)]">
      <div className="space-y-3">
        <h3 className="font-display text-3xl font-semibold uppercase leading-none tracking-[-0.04em] text-foreground sm:text-4xl">
          Choose Your Time
        </h3>
      </div>

      <div className="space-y-8">
        <div className="space-y-4">
          <div className="overflow-x-auto pb-2 [scrollbar-width:none] [-ms-overflow-style:none]">
            <div className="flex min-w-max gap-2.5 sm:gap-3">
              {dates.map((date) => {
                const isSelected = state.dateId === date.id;
                const isDisabled = !date.isAvailable;

                return (
                  <button
                    key={date.id}
                    type="button"
                    disabled={isDisabled}
                    onClick={() =>
                      setState((current) => ({
                        ...current,
                        dateId: date.id,
                        time: null,
                      }))
                    }
                    className={`min-w-[5rem] border px-3 py-4 text-center transition-colors sm:min-w-[5.5rem] sm:px-4 ${
                      isSelected
                        ? "border-accent bg-foreground text-background"
                        : isDisabled
                          ? "cursor-not-allowed border-border bg-transparent text-foreground-muted opacity-50"
                          : "border-border bg-transparent text-foreground-secondary hover:border-foreground-secondary hover:text-foreground"
                    }`}
                  >
                    <span className="block font-primary text-[11px] uppercase tracking-[0.26em]">
                      {date.day}
                    </span>
                    <span className="mt-2 block font-display text-3xl leading-none tracking-[-0.04em]">
                      {date.date}
                    </span>
                    <span className="mt-2 block font-primary text-[11px] uppercase tracking-[0.26em]">
                      {date.month}
                    </span>
                    <span className="mt-2 block font-primary text-[9px] uppercase tracking-[0.18em]">
                      {date.isAvailable ? "Available" : "Closed"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <p className="font-primary text-xs uppercase tracking-[0.3em] text-foreground-secondary">
            Available Times
          </p>

          {!hasAvailableDates ? (
            <div className="border border-border bg-background px-4 py-5">
              <p className="font-primary text-sm leading-6 text-foreground-secondary">
                No booking dates are currently available.
              </p>
            </div>
          ) : timeGroups.length === 0 ? (
            <div className="border border-border bg-background px-4 py-5">
              <p className="font-primary text-sm leading-6 text-foreground-secondary">
                No time slots are available for the selected date and service.
              </p>
            </div>
          ) : (
            timeGroups.map((group) => (
              <div key={group.label} className="space-y-3">
                <p className="font-primary text-xs uppercase tracking-[0.24em] text-foreground-muted">
                  {group.label}
                </p>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
                  {group.slots.map((slot) => {
                    const isSelected = state.time === slot;

                    return (
                      <button
                        key={slot}
                        type="button"
                        onClick={() =>
                          setState((current) => ({
                            ...current,
                            time: slot,
                          }))
                        }
                        className={`min-h-11 border px-3 py-3 font-primary text-xs uppercase tracking-[0.16em] transition-colors sm:px-4 sm:text-sm sm:tracking-[0.18em] ${
                          isSelected
                            ? "border-accent bg-foreground text-background"
                            : "border-border bg-transparent text-foreground-secondary hover:border-foreground-secondary hover:text-foreground"
                        }`}
                      >
                        {slot}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <StepButton onClick={onBack} variant="secondary">
          ← Back
        </StepButton>
        <StepButton
          onClick={onNext}
          disabled={!state.dateId || !state.time}
        >
          Continue →
        </StepButton>
      </div>
    </div>
  );
}

function DetailsStep({
  authRole,
  state,
  setState,
  onBack,
  onNext,
}: Pick<StepProps, "state" | "setState" | "onBack" | "onNext"> & {
  authRole: "admin" | "customer" | null;
}) {
  const [showNote, setShowNote] = useState(
    Boolean(state.note),
  );
  const guestModeRequired = authRole !== "customer";
  const canEditDetails = authRole === "customer" || state.bookingMode === "guest";

  const isValid =
    state.firstName.trim() &&
    state.lastName.trim() &&
    state.phone.trim() &&
    state.email.trim();

  return (
    <div className="space-y-8 animate-[booking-panel-in_320ms_cubic-bezier(0.22,1,0.36,1)]">
      <div className="space-y-3">
        <h3 className="font-display text-3xl font-semibold uppercase leading-none tracking-[-0.04em] text-foreground sm:text-4xl">
          Almost Yours.
        </h3>
      </div>

      {guestModeRequired ? (
        <div className="space-y-4 border border-border bg-background px-4 py-5 sm:px-5">
          <p className="font-primary text-xs uppercase tracking-[0.24em] text-foreground-secondary">
            Continue your booking
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/login"
              className="inline-flex min-h-12 items-center justify-center border border-border px-4 py-3 font-primary text-xs uppercase tracking-[0.18em] text-foreground-secondary transition-colors hover:border-foreground-secondary hover:text-foreground sm:text-sm"
            >
              Login / Continue with Account
            </Link>
            <button
              type="button"
              onClick={() =>
                setState((current) => ({
                  ...current,
                  bookingMode: "guest",
                }))
              }
              className={`inline-flex min-h-12 items-center justify-center border px-4 py-3 font-primary text-xs uppercase tracking-[0.18em] transition-colors sm:text-sm ${
                state.bookingMode === "guest"
                  ? "border-accent bg-accent text-background"
                  : "border-border text-foreground-secondary hover:border-foreground-secondary hover:text-foreground"
              }`}
            >
              Continue as Guest
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6">
        {[
          ["firstName", "First Name", "text"],
          ["lastName", "Last Name", "text"],
          ["phone", "Phone", "tel"],
          ["email", "Email", "email"],
        ].map(([key, label, type]) => (
          <label key={key} className="space-y-3">
            <span className="font-primary text-xs uppercase tracking-[0.24em] text-foreground-secondary">
              {label}
            </span>
            <input
              type={type}
              value={state[key as keyof BookingState] as string}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  [key]: event.target.value,
                }))
              }
              disabled={!canEditDetails}
              className="w-full border-0 border-b border-border bg-transparent pb-3 font-primary text-base text-foreground outline-none transition-colors placeholder:text-foreground-muted focus:border-foreground-secondary"
            />
          </label>
        ))}
      </div>

      <div className="space-y-4">
        {!showNote ? (
          <button
            type="button"
            onClick={() => setShowNote(true)}
            className="font-primary text-xs uppercase tracking-[0.26em] text-foreground-secondary transition-colors hover:text-foreground"
          >
            + Add a Note
          </button>
        ) : (
          <label className="block space-y-3">
            <span className="font-primary text-xs uppercase tracking-[0.24em] text-foreground-secondary">
              Note
            </span>
            <textarea
              value={state.note}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  note: event.target.value,
                }))
              }
              rows={4}
              className="w-full resize-none border border-border bg-transparent px-4 py-3 font-primary text-base text-foreground outline-none transition-colors placeholder:text-foreground-muted focus:border-foreground-secondary"
            />
          </label>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <StepButton onClick={onBack} variant="secondary">
          ← Back
        </StepButton>
        <StepButton
          onClick={onNext}
          disabled={!canEditDetails || !isValid}
        >
          Review →
        </StepButton>
      </div>
    </div>
  );
}

function ReviewStep({
  selectedService,
  selectedDate,
  state,
  setState,
  onBack,
  onNext,
}: Pick<
  StepProps,
  "selectedService" | "selectedDate" | "state" | "setState" | "onBack" | "onNext"
>) {
  if (!selectedService || !selectedDate || !state.time) {
    return null;
  }

  return (
    <div className="space-y-8 animate-[booking-panel-in_320ms_cubic-bezier(0.22,1,0.36,1)]">
      <div className="space-y-3">
        <h3 className="font-display text-3xl font-semibold uppercase leading-none tracking-[-0.04em] text-foreground sm:text-4xl">
          Your Session.
        </h3>
      </div>

      <div className="space-y-3 border-t border-border pt-6">
        <label className="flex cursor-pointer items-start gap-3 text-left">
          <input
            type="checkbox"
            checked={state.marketingEmailConsent}
            onChange={(event) => setState((current) => ({ ...current, marketingEmailConsent: event.target.checked }))}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
          />
          <span className="font-primary text-xs leading-5 text-foreground-muted sm:text-sm">
            I would like to receive news and special offers from 1200 Hairstudio by email.
          </span>
        </label>
        <p className="pl-7 font-primary text-[11px] leading-5 text-foreground-muted">
          Optional and separate from your booking. Read our{" "}
          <Link href="/privacy" className="underline underline-offset-4 transition-colors hover:text-foreground">
            Privacy Policy
          </Link>
          .
        </p>
      </div>

      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="space-y-2">
            <h4 className="font-display text-2xl uppercase tracking-[-0.04em] text-foreground sm:text-3xl">
              {selectedService.title}
            </h4>
            <p className="font-primary text-xs uppercase tracking-[0.24em] text-foreground-muted">
              {selectedService.duration}
            </p>
          </div>
          <p className="font-primary text-sm uppercase tracking-[0.2em] text-foreground-secondary">
            <ServicePrice service={selectedService} />
          </p>
        </div>

        <div className="border-t border-border pt-6">
          <p className="font-primary text-sm uppercase tracking-[0.22em] text-foreground-secondary">
            {selectedDate.fullDate}
          </p>
          <p className="mt-3 font-display text-4xl uppercase leading-none tracking-[-0.04em] text-foreground">
            {state.time}
          </p>
        </div>

        <div className="border-t border-border pt-6">
          <p className="font-primary text-xs uppercase tracking-[0.24em] text-foreground-muted">
            Barber
          </p>
          <p className="mt-2 font-display text-2xl uppercase tracking-[-0.04em] text-foreground">
            Arban Shaqiri
          </p>
        </div>

        <div className="border-t border-border pt-6">
          <div className="flex items-center justify-between gap-4">
            <p className="font-primary text-sm uppercase tracking-[0.22em] text-foreground-secondary">
              Total
            </p>
            <p className="font-display text-2xl uppercase tracking-[-0.04em] text-foreground">
              {formatPrice(selectedService.finalPrice)}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <StepButton onClick={onBack} variant="secondary">
          ← Back
        </StepButton>
        <StepButton onClick={onNext}>
          Confirm Booking →
        </StepButton>
      </div>
    </div>
  );
}

function BookingConfirmation({
  onReset,
  service,
  date,
  time,
}: {
  onReset: () => void;
  service: Service | null;
  date: BookingDate | null;
  time: string | null;
}) {
  if (!service || !date || !time) {
    return null;
  }

  return (
    <div className="space-y-8 text-center animate-[booking-confirm-in_420ms_cubic-bezier(0.22,1,0.36,1)]">
      <div className="mx-auto inline-flex h-14 w-14 items-center justify-center border border-accent font-display text-3xl text-foreground">
        ✓
      </div>

      <div className="space-y-4">
        <h3 className="font-display text-4xl font-semibold uppercase leading-none tracking-[-0.04em] text-foreground sm:text-5xl">
          Your Chair
          <br />
          Is Reserved.
        </h3>
        <p className="font-primary text-sm uppercase tracking-[0.22em] text-foreground-secondary">
          {service.title} · {formatPrice(service.finalPrice)}
        </p>
      </div>

      <div className="space-y-2 border-t border-border pt-6">
        <p className="font-primary text-sm uppercase tracking-[0.22em] text-foreground-secondary">
          {date.fullDate}
        </p>
        <p className="font-display text-4xl uppercase leading-none tracking-[-0.04em] text-foreground">
          {time}
        </p>
        <p className="font-primary text-xs uppercase tracking-[0.24em] text-foreground-muted">
          Booking #1200-DEMO
        </p>
      </div>

      <div className="flex justify-center pt-2">
        <StepButton onClick={onReset}>
          Book Another Session
        </StepButton>
      </div>
    </div>
  );
}

type BookingSectionClientProps = {
  authRole: "admin" | "customer" | null;
  customerProfile: {
    fullName: string;
    email: string;
    phone: string;
  } | null;
  services: Service[];
  dates: BookingDate[];
  slotMap: Record<
    string,
    Record<string, { time: string; slot_start: string; slot_end: string }[]>
  >;
  loadError: string | null;
};

export default function BookingSectionClient({
  authRole,
  customerProfile,
  services,
  dates,
  slotMap,
  loadError,
}: BookingSectionClientProps) {
  const router = useRouter();
  const [isSubmitting, startSubmitTransition] = useTransition();
  const [submitFeedback, setSubmitFeedback] = useState("");
  const firstAvailableDateId =
    dates.find((date) => date.isAvailable)?.id ?? null;
  const [step, setStep] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const initialNameParts = customerProfile?.fullName.trim().split(/\s+/) ?? [];
  const initialFirstName = initialNameParts[0] ?? "";
  const initialLastName = initialNameParts.slice(1).join(" ");
  const [state, setState] = useState<BookingState>({
    serviceId: null,
    dateId: firstAvailableDateId,
    time: null,
    bookingMode: authRole === "customer" ? "account" : "guest",
    firstName: initialFirstName,
    lastName: initialLastName,
    phone: customerProfile?.phone ?? "",
    email: customerProfile?.email ?? "",
    note: "",
    marketingEmailConsent: false,
  });

  const selectedService =
    services.find((service) => service.id === state.serviceId) ??
    null;
  const visibleDates = useMemo(
    () =>
      dates.map((date) => ({
        ...date,
        isAvailable: Boolean(
          selectedService && slotMap[selectedService.id]?.[date.id]?.length,
        ),
      })),
    [dates, selectedService, slotMap],
  );
  const selectedDate =
    visibleDates.find((date) => date.id === state.dateId) ??
    visibleDates.find((date) => date.isAvailable) ??
    null;
  const timeGroups = useMemo(
    () =>
      selectedDate && selectedService
        ? groupTimeSlots(
            (slotMap[selectedService.id]?.[selectedDate.id] ?? []).map(
              (slot) => slot.time,
            ),
          )
        : [],
    [selectedDate, selectedService, slotMap],
  );

  const handleConfirmBooking = useCallback(async () => {
    if (!selectedService || !selectedDate || !state.time) {
      setSubmitFeedback("Choose a service, date, and time.");
      return;
    }

    setSubmitFeedback("");
    startSubmitTransition(async () => {
      const formData = new FormData();
      formData.set("serviceId", selectedService.id);
      formData.set("dateKey", selectedDate.id);
      formData.set("startTime", state.time ?? "");
      formData.set("bookingMode", state.bookingMode);
      formData.set("firstName", state.firstName);
      formData.set("lastName", state.lastName);
      formData.set("email", state.email);
      formData.set("phone", state.phone);
      formData.set("note", state.note);
      if (selectedService.promotionId) formData.set("promotionId", selectedService.promotionId);
      if (state.marketingEmailConsent) formData.set("marketingEmailConsent", "on");

      const result = await bookAppointment(formData);

      if (result.error) {
        setSubmitFeedback(result.error);
        router.refresh();
        return;
      }

      setConfirmed(true);
      setSubmitFeedback("");
      router.refresh();
    });
  }, [router, selectedDate, selectedService, state]);

  const panelContent = useMemo(() => {
    if (confirmed) {
      return (
        <BookingConfirmation
          onReset={() => {
            setConfirmed(false);
            setStep(0);
            setState({
              serviceId: null,
              dateId: firstAvailableDateId,
              time: null,
              bookingMode: authRole === "customer" ? "account" : "guest",
              firstName: initialFirstName,
              lastName: initialLastName,
              phone: customerProfile?.phone ?? "",
              email: customerProfile?.email ?? "",
              note: "",
              marketingEmailConsent: false,
            });
          }}
          service={selectedService}
          date={selectedDate}
          time={state.time}
        />
      );
    }

    const sharedProps = {
      state,
      setState,
      selectedService,
      selectedDate,
      onBack: () => setStep((current) => Math.max(0, current - 1)),
      onNext: () => setStep((current) => Math.min(3, current + 1)),
    };

    if (step === 0) {
      return <ServiceStep {...sharedProps} services={services} />;
    }

    if (step === 1) {
      return (
        <DateTimeStep {...sharedProps} dates={visibleDates} timeGroups={timeGroups} />
      );
    }

    if (step === 2) {
      return <DetailsStep {...sharedProps} authRole={authRole} />;
    }

    return (
      <ReviewStep
        {...sharedProps}
        onNext={handleConfirmBooking}
      />
    );
  }, [authRole, confirmed, customerProfile?.email, customerProfile?.phone, firstAvailableDateId, handleConfirmBooking, initialFirstName, initialLastName, selectedDate, selectedService, services, state, step, timeGroups, visibleDates]);

  return (
    <section id="booking" className="bg-background">
      <div className="page-container py-10 sm:py-12 lg:py-14">
        <div className="grid grid-cols-1 gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,620px)] xl:items-center xl:gap-14 2xl:gap-16">
          <div className="relative flex min-w-0 flex-col justify-start lg:min-h-full lg:justify-center">
            <div className="max-w-xl space-y-4">
              <p className="font-primary text-xs uppercase tracking-[0.34em] text-foreground-secondary">
                05 / Book Your Session
              </p>
              <h2 className="font-display text-[clamp(2.2rem,6vw,4.5rem)] font-semibold uppercase leading-[0.95] tracking-[-0.04em] text-foreground">
                Your Time.
                <br />
                Your Chair.
              </h2>
              <p className="font-primary max-w-md text-sm leading-7 text-foreground-secondary sm:text-base">
                Choose your service and reserve a time that works for you.
              </p>
            </div>
          </div>

          <div className="w-full max-w-[620px] xl:justify-self-end">
            <div className="border border-border bg-surface px-4 py-5 sm:px-6 sm:py-7 lg:px-7 lg:py-8">
              {loadError ? (
                <div className="border border-border bg-background px-4 py-5">
                  <p className="font-primary text-sm leading-6 text-foreground-secondary">
                    {loadError}
                  </p>
                </div>
              ) : null}

              {!loadError && services.length === 0 ? (
                <div className="border border-border bg-background px-4 py-5">
                  <p className="font-primary text-sm leading-6 text-foreground-secondary">
                    No services are available to book right now.
                  </p>
                </div>
              ) : null}

              {!loadError && services.length > 0 && dates.length === 0 ? (
                <div className="border border-border bg-background px-4 py-5">
                  <p className="font-primary text-sm leading-6 text-foreground-secondary">
                    No upcoming booking dates are available right now.
                  </p>
                </div>
              ) : null}

              {!loadError && services.length > 0 && dates.length > 0 ? (
                <>
              {!confirmed && <BookingProgress step={step} />}

              <div className={`${confirmed ? "" : "pt-7 sm:pt-8"}`}>
                {!confirmed && (
                  <div className="pb-6">
                    <BookingSummary
                      service={selectedService}
                      date={selectedDate}
                      time={state.time}
                    />
                  </div>
                )}

                {!confirmed && submitFeedback ? (
                  <div className="pb-6">
                    <p className="font-primary text-sm leading-6 text-foreground-secondary">
                      {submitFeedback}
                    </p>
                    {authRole !== "customer" ? (
                      <div className="pt-4">
                        <Link
                          href="/login"
                          className="inline-flex min-h-11 items-center justify-center border border-border px-4 py-3 font-primary text-xs uppercase tracking-[0.18em] text-foreground-secondary transition-colors hover:border-foreground-secondary hover:text-foreground"
                        >
                          Login to Book
                        </Link>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {panelContent}
              </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
