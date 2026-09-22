"use client";

import type {
  Dispatch,
  ReactNode,
  SetStateAction,
} from "react";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { bookAppointment, clearGuestBookingSession } from "@/app/actions/appointments";
import { getServiceBookingAvailability } from "@/app/actions/booking-availability";
import {
  groupTimeSlots,
  type BookingDateOption,
  type TimeGroup,
} from "@/lib/public/booking-availability-utils";
import type { HomepageContent } from "@/lib/homepage-content-defaults";

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
  return <span className={`flex ${compact ? "items-center justify-end text-right" : "items-end"} flex-wrap gap-2`}><span className="font-primary text-xs uppercase tracking-[0.16em] text-foreground-muted line-through">{formatPrice(service.originalPrice)}</span><span className="border border-accent/50 bg-accent/10 px-2 py-1 font-primary text-[9px] font-semibold uppercase tracking-[0.16em] text-accent">{badge}</span><span className="font-display text-2xl uppercase text-foreground">{formatPrice(service.finalPrice)}</span>{compact ? null : <span className="basis-full font-primary text-[10px] uppercase tracking-[0.18em] text-accent">Your promotional price</span>}</span>;
}

function ServiceStep({
  services,
  state,
  onNext,
  onServiceSelect,
}: Pick<StepProps, "state" | "onNext"> & {
  services: Service[];
  onServiceSelect: (serviceId: string) => void;
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
              onClick={() => onServiceSelect(service.id)}
              aria-pressed={isSelected}
              className={`group relative grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_6.75rem_1.25rem] items-start gap-x-2.5 border-b px-3 py-5 text-left transition-colors min-[430px]:grid-cols-[minmax(0,1fr)_7.5rem_1.25rem] min-[430px]:gap-x-3 min-[430px]:px-4 sm:grid-cols-[minmax(0,1fr)_13rem_1.25rem] sm:gap-x-4 sm:py-6 ${
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
              <div className="min-w-0 space-y-2">
                <span
                  className={`block break-words font-display text-2xl uppercase tracking-[-0.04em] transition-colors sm:text-3xl ${
                    isSelected
                      ? "text-foreground"
                      : "text-foreground-secondary group-hover:text-foreground"
                  }`}
                >
                  {service.title}
                </span>
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
                className={`flex w-full justify-end pt-1 text-right transition-colors ${
                  isSelected
                    ? "text-foreground-secondary"
                    : "text-foreground-muted group-hover:text-foreground-secondary"
                }`}
              >
                <ServicePrice service={service} compact />
              </span>

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

type AvailabilitySlots = Record<
  string,
  { time: string; slot_start: string; slot_end: string }[]
>;

function DetailsStep({
  authRole,
  allowGuestBookings,
  state,
  setState,
  onBack,
  onNext,
}: Pick<StepProps, "state" | "setState" | "onBack" | "onNext"> & {
  authRole: "admin" | "customer" | null;
  allowGuestBookings: boolean;
}) {
  const [showNote, setShowNote] = useState(
    Boolean(state.note),
  );
  const guestModeRequired = authRole !== "customer";
  const canEditDetails = authRole === "customer" || (allowGuestBookings && state.bookingMode === "guest");

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
            {allowGuestBookings ? <button
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
            </button> : null}
          </div>
          {!allowGuestBookings ? <p className="font-primary text-sm leading-6 text-foreground-secondary">Guest bookings are currently unavailable. Please sign in or create an account to continue.</p> : null}
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
  barberName,
  loyaltyReward,
  applyLoyaltyReward,
  setApplyLoyaltyReward,
}: Pick<
  StepProps,
  "selectedService" | "selectedDate" | "state" | "setState" | "onBack" | "onNext"
> & { barberName: string; loyaltyReward: BookingSectionClientProps["loyaltyReward"]; applyLoyaltyReward: boolean; setApplyLoyaltyReward: (value: boolean) => void }) {
  if (!selectedService || !selectedDate || !state.time) {
    return null;
  }
  const rewardDiscount = loyaltyReward ? loyaltyReward.rewardType === "free_service" ? selectedService.originalPrice : loyaltyReward.rewardType === "percentage" ? selectedService.originalPrice * Math.min(100, Math.max(0, loyaltyReward.rewardValue ?? 0)) / 100 : Math.min(selectedService.originalPrice, Math.max(0, loyaltyReward.rewardValue ?? 0)) : 0;
  const loyaltyTotal = applyLoyaltyReward ? Math.max(0, selectedService.originalPrice - rewardDiscount) : selectedService.finalPrice;

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
        {loyaltyReward ? <div className="border-l-2 border-accent bg-background px-4 py-4"><p className="font-primary text-[10px] uppercase tracking-[0.18em] text-accent">Your Loyalty Reward</p><p className="mt-2 font-display text-2xl uppercase text-foreground">{loyaltyReward.rewardType === "free_service" ? "Free Service" : loyaltyReward.rewardType === "percentage" ? `${loyaltyReward.rewardValue}% Off` : `CHF ${Number(loyaltyReward.rewardValue ?? 0).toFixed(2)} Off`}</p><div className="mt-3 flex flex-col gap-2 sm:flex-row"><button type="button" onClick={() => setApplyLoyaltyReward(true)} className={`min-h-11 border px-4 text-[10px] uppercase tracking-[0.15em] ${applyLoyaltyReward ? "border-accent bg-accent text-background" : "border-border text-accent"}`}>Apply Reward</button><button type="button" onClick={() => setApplyLoyaltyReward(false)} className={`min-h-11 border px-4 text-[10px] uppercase tracking-[0.15em] ${!applyLoyaltyReward ? "border-foreground-muted text-foreground" : "border-border text-foreground-muted"}`}>Save for Later</button></div></div> : null}
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
            {barberName}
          </p>
        </div>

        <div className="border-t border-border pt-6">
          <div className="flex items-center justify-between gap-4">
            <p className="font-primary text-sm uppercase tracking-[0.22em] text-foreground-secondary">
              Total
            </p>
            <p className="font-display text-2xl uppercase tracking-[-0.04em] text-foreground">
              {formatPrice(loyaltyTotal)}
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

export type PersistedBookingConfirmation = {
  serviceTitle: string;
  price: number;
  date: string;
  time: string;
  bookingReference: string | null;
  manageUrl: string | null;
  status: string;
};

function BookingConfirmation({
  onReset,
  serviceTitle,
  price,
  date,
  time,
  bookingReference,
  manageUrl,
  status,
}: {
  onReset: () => void;
  serviceTitle: string;
  price: number;
  date: string;
  time: string;
  bookingReference: string | null;
  manageUrl: string | null;
  status: string;
}) {
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
          {serviceTitle} · {formatPrice(price)}
        </p>
      </div>

      <div className="space-y-2 border-t border-border pt-6">
        <p className="font-primary text-sm uppercase tracking-[0.22em] text-foreground-secondary">
          {date}
        </p>
        <p className="font-display text-4xl uppercase leading-none tracking-[-0.04em] text-foreground">
          {time}
        </p>
        <p className="font-primary text-xs uppercase tracking-[0.24em] text-foreground-muted">
          Booking #{bookingReference ?? "Confirmed"}
        </p>
        <p className="font-primary text-[10px] uppercase tracking-[0.22em] text-foreground-muted">
          {status}
        </p>
      </div>

      {manageUrl ? <a href={manageUrl} className="inline-flex min-h-12 items-center justify-center border border-accent px-6 font-primary text-xs uppercase tracking-[0.2em] text-accent transition-colors hover:bg-accent hover:text-background">Manage Booking →</a> : null}

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
  allowGuestBookings: boolean;
  customerProfile: {
    fullName: string;
    email: string;
    phone: string;
  } | null;
  services: Service[];
  loadError: string | null;
  content: HomepageContent;
  persistedConfirmation: PersistedBookingConfirmation | null;
  shouldClearGuestBookingCookie: boolean;
  loyaltyReward: { id: string; rewardType: string; rewardValue: number | null } | null;
};

export default function BookingSectionClient({
  authRole,
  allowGuestBookings,
  customerProfile,
  services,
  loadError,
  content,
  persistedConfirmation,
  shouldClearGuestBookingCookie,
  loyaltyReward,
}: BookingSectionClientProps) {
  const router = useRouter();
  const [isSubmitting, startSubmitTransition] = useTransition();
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  const [dates, setDates] = useState<BookingDate[]>([]);
  const [slotsByDate, setSlotsByDate] = useState<AvailabilitySlots>({});
  const [submitFeedback, setSubmitFeedback] = useState("");
  const [step, setStep] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [bookingReference, setBookingReference] = useState<string | null>(null);
  const [manageUrl, setManageUrl] = useState<string | null>(null);
  const [hidePersistedConfirmation, setHidePersistedConfirmation] = useState(false);
  const [applyLoyaltyReward, setApplyLoyaltyReward] = useState(false);
  const initialNameParts = customerProfile?.fullName.trim().split(/\s+/) ?? [];
  const initialFirstName = initialNameParts[0] ?? "";
  const initialLastName = initialNameParts.slice(1).join(" ");
  const [state, setState] = useState<BookingState>({
    serviceId: null,
    dateId: null,
    time: null,
    bookingMode: authRole === "customer" ? "account" : "guest",
    firstName: initialFirstName,
    lastName: initialLastName,
    phone: customerProfile?.phone ?? "",
    email: customerProfile?.email ?? "",
    note: "",
    marketingEmailConsent: false,
  });

  useEffect(() => {
    if (shouldClearGuestBookingCookie) {
      void clearGuestBookingSession();
    }
  }, [shouldClearGuestBookingCookie]);

  const selectedService =
    services.find((service) => service.id === state.serviceId) ??
    null;
  const selectedDate =
    dates.find((date) => date.id === state.dateId) ??
    dates.find((date) => date.isAvailable) ??
    null;
  const timeGroups = useMemo(
    () =>
      selectedDate && selectedService
        ? groupTimeSlots(
            (slotsByDate[selectedDate.id] ?? []).map(
              (slot) => slot.time,
            ),
          )
        : [],
    [selectedDate, selectedService, slotsByDate],
  );

  const handleServiceSelected = useCallback((serviceId: string) => {
    setState((current) => ({
      ...current,
      serviceId,
      dateId: null,
      time: null,
    }));
    setDates([]);
    setSlotsByDate({});
    setAvailabilityError("");
  }, []);

  const handleLoadAvailability = useCallback(async () => {
    if (!state.serviceId || isLoadingAvailability) return;

    const requestedServiceId = state.serviceId;
    setStep(1);
    setIsLoadingAvailability(true);
    setAvailabilityError("");
    setDates([]);
    setSlotsByDate({});

    try {
      const result = await getServiceBookingAvailability(requestedServiceId);

      setState((current) => {
        if (current.serviceId !== requestedServiceId) return current;
        const firstAvailableDateId = result.dates.find((date) => date.isAvailable)?.id ?? null;
        return { ...current, dateId: firstAvailableDateId, time: null };
      });
      setDates(result.dates);
      setSlotsByDate(result.slotsByDate);
      setAvailabilityError(result.error ?? "");
    } catch {
      setAvailabilityError("Booking availability is unavailable right now.");
    } finally {
      setIsLoadingAvailability(false);
    }
  }, [isLoadingAvailability, state.serviceId]);

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
      if (applyLoyaltyReward && loyaltyReward) formData.set("loyaltyRewardId", loyaltyReward.id);
      if (state.marketingEmailConsent) formData.set("marketingEmailConsent", "on");

      const result = await bookAppointment(formData);

      if (result.error) {
        setSubmitFeedback(result.error);
        router.refresh();
        return;
      }

      if (!("bookingReference" in result) || !("manageUrl" in result)) {
        setSubmitFeedback("Your booking was created, but its management details could not be loaded.");
        router.refresh();
        return;
      }

      setConfirmed(true);
      setBookingReference(result.bookingReference ?? null);
      setManageUrl(result.manageUrl ?? null);
      setSubmitFeedback("");
      router.refresh();
    });
  }, [applyLoyaltyReward, loyaltyReward, router, selectedDate, selectedService, state]);

  const panelContent = useMemo(() => {
    const confirmation = confirmed && selectedService && selectedDate && state.time
      ? {
          serviceTitle: selectedService.title,
          price: selectedService.finalPrice,
          date: selectedDate.fullDate,
          time: state.time,
          bookingReference,
          manageUrl,
          status: "confirmed",
        }
      : !hidePersistedConfirmation
        ? persistedConfirmation
        : null;

    if (confirmation) {
      return (
        <BookingConfirmation
          onReset={() => {
            setConfirmed(false);
            setHidePersistedConfirmation(true);
            setStep(0);
            setState({
              serviceId: null,
              dateId: null,
              time: null,
              bookingMode: authRole === "customer" ? "account" : "guest",
              firstName: initialFirstName,
              lastName: initialLastName,
              phone: customerProfile?.phone ?? "",
              email: customerProfile?.email ?? "",
              note: "",
              marketingEmailConsent: false,
            });
            setApplyLoyaltyReward(false);
          }}
          {...confirmation}
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
      return (
        <ServiceStep
          {...sharedProps}
          services={services}
          onServiceSelect={handleServiceSelected}
          onNext={handleLoadAvailability}
        />
      );
    }

    if (step === 1) {
      if (isLoadingAvailability) {
        return (
          <div className="border border-border bg-background px-4 py-5">
            <p className="font-primary text-sm leading-6 text-foreground-secondary">
              Loading available times…
            </p>
          </div>
        );
      }

      if (availabilityError) {
        return (
          <div className="space-y-4">
            <div className="border border-border bg-background px-4 py-5">
              <p className="font-primary text-sm leading-6 text-foreground-secondary">
                {availabilityError}
              </p>
            </div>
            <StepButton onClick={() => setStep(0)} variant="secondary">← Back</StepButton>
          </div>
        );
      }

      return (
        <DateTimeStep {...sharedProps} dates={dates} timeGroups={timeGroups} />
      );
    }

    if (step === 2) {
      return <DetailsStep {...sharedProps} authRole={authRole} allowGuestBookings={allowGuestBookings} />;
    }

    return (
      <ReviewStep
        {...sharedProps}
        barberName={content.barber_name}
        loyaltyReward={loyaltyReward}
        applyLoyaltyReward={applyLoyaltyReward}
        setApplyLoyaltyReward={setApplyLoyaltyReward}
        onNext={handleConfirmBooking}
      />
    );
  }, [allowGuestBookings, applyLoyaltyReward, authRole, availabilityError, bookingReference, confirmed, content.barber_name, customerProfile?.email, customerProfile?.phone, dates, handleConfirmBooking, handleLoadAvailability, handleServiceSelected, hidePersistedConfirmation, initialFirstName, initialLastName, isLoadingAvailability, loyaltyReward, manageUrl, persistedConfirmation, selectedDate, selectedService, services, state, step, timeGroups]);

  return (
    <section id="booking" className="bg-background">
      <div className="page-container py-10 sm:py-12 lg:py-14">
        <div className="grid grid-cols-1 gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,620px)] xl:items-center xl:gap-14 2xl:gap-16">
          <div className="relative flex min-w-0 flex-col justify-start lg:min-h-full lg:justify-center">
            <div className="max-w-xl space-y-4">
              <p className="font-primary text-xs uppercase tracking-[0.34em] text-foreground-secondary">
                {content.booking_eyebrow}
              </p>
              <h2 className="whitespace-pre-line font-display text-[clamp(2.2rem,6vw,4.5rem)] font-semibold uppercase leading-[0.95] tracking-[-0.04em] text-foreground">
                {content.booking_title}
              </h2>
              <p className="font-primary max-w-md text-sm leading-7 text-foreground-secondary sm:text-base">
                {content.booking_description}
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

              {!loadError && services.length > 0 ? (
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
