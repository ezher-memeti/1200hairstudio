"use client";

import type {
  Dispatch,
  ReactNode,
  SetStateAction,
} from "react";
import { useMemo, useState } from "react";
import {
  generateSlots,
  groupTimeSlots,
  type BookingDateOption,
  type SerializedZurichDateTimeInfo,
  type TimeGroup,
  hydrateZurichDateTime,
} from "@/lib/public/booking-availability-utils";

type Service = {
  id: string;
  title: string;
  description: string;
  duration: string;
  durationMinutes: number;
  price: string;
  image_url: string | null;
};
type BookingDate = BookingDateOption;

type BookingState = {
  serviceId: string | null;
  dateId: string | null;
  time: string | null;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  note: string;
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
                    {service.price}
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
  state,
  setState,
  onBack,
  onNext,
}: Pick<StepProps, "state" | "setState" | "onBack" | "onNext">) {
  const [showNote, setShowNote] = useState(
    Boolean(state.note),
  );

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
          disabled={!isValid}
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
  onBack,
  onNext,
}: Pick<
  StepProps,
  "selectedService" | "selectedDate" | "state" | "onBack" | "onNext"
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
            {selectedService.price}
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
              {selectedService.price}
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
          {service.title} · {service.price}
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
  services: Service[];
  dates: BookingDate[];
  initialTimeGroups: TimeGroup[];
  currentZurich: SerializedZurichDateTimeInfo;
  loadError: string | null;
};

export default function BookingSectionClient({
  services,
  dates,
  initialTimeGroups,
  currentZurich,
  loadError,
}: BookingSectionClientProps) {
  const currentZurichDateTime = useMemo(
    () => hydrateZurichDateTime(currentZurich),
    [currentZurich],
  );
  const firstAvailableDateId =
    dates.find((date) => date.isAvailable)?.id ?? null;
  const [step, setStep] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [state, setState] = useState<BookingState>({
    serviceId: null,
    dateId: firstAvailableDateId,
    time: null,
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    note: "",
  });

  const selectedService =
    services.find((service) => service.id === state.serviceId) ??
    null;
  const selectedDate =
    dates.find((date) => date.id === state.dateId) ??
    dates.find((date) => date.isAvailable) ??
    null;
  const timeGroups =
    selectedDate && selectedService
      ? groupTimeSlots(
          generateSlots(
            selectedDate.effectiveHours.open_time,
            selectedDate.effectiveHours.close_time,
            selectedService.durationMinutes,
            {
              dateKey: selectedDate.id,
              currentDateTime: currentZurichDateTime,
            },
          ),
        )
      : initialTimeGroups;

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
              firstName: "",
              lastName: "",
              phone: "",
              email: "",
              note: "",
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
        <DateTimeStep
          {...sharedProps}
          dates={dates}
          timeGroups={timeGroups}
        />
      );
    }

    if (step === 2) {
      return <DetailsStep {...sharedProps} />;
    }

    return (
      <ReviewStep
        {...sharedProps}
        onNext={() => setConfirmed(true)}
      />
    );
  }, [confirmed, dates, firstAvailableDateId, selectedDate, selectedService, services, state, step, timeGroups]);

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
