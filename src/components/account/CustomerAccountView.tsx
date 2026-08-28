"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { CustomerAppointmentSummary } from "@/lib/appointments/types";
import type { CustomerRecord } from "@/lib/customers/types";
import { createClient } from "@/lib/supabase/client";
import { updateCustomerAccount } from "@/app/account/actions";

type CustomerAccountViewProps = {
  customer: Pick<CustomerRecord, "id" | "full_name" | "email" | "phone">;
  pastAppointments: CustomerAppointmentSummary[];
  upcomingAppointments: CustomerAppointmentSummary[];
};

export default function CustomerAccountView({
  customer,
  pastAppointments,
  upcomingAppointments,
}: CustomerAccountViewProps) {
  const router = useRouter();
  const [fullName, setFullName] = useState(customer.full_name);
  const [phone, setPhone] = useState(customer.phone);
  const [feedback, setFeedback] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback("");

    const formData = new FormData();
    formData.set("fullName", fullName);
    formData.set("phone", phone);

    startTransition(async () => {
      const result = await updateCustomerAccount(formData);

      if (result.error) {
        setFeedback(result.error);
        return;
      }

      setFeedback("Saved");
      router.refresh();
    });
  }

  async function handleLogout() {
    setIsLoggingOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="space-y-10">
      <section className="grid grid-cols-1 gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)] xl:gap-14">
        <div className="space-y-4">
          <p className="font-primary text-xs uppercase tracking-[0.34em] text-foreground-secondary">
            Account
          </p>
          <h1 className="font-display text-[clamp(2.2rem,6vw,4.5rem)] font-semibold uppercase leading-[0.95] tracking-[-0.04em] text-foreground">
            Your Profile
          </h1>
          <p className="max-w-lg font-primary text-sm leading-7 text-foreground-secondary sm:text-base">
            Manage your account details and keep your booking information up to date.
          </p>
        </div>

        <div className="border border-border bg-surface px-5 py-6 sm:px-7 sm:py-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <label className="block space-y-3">
              <span className="font-primary text-xs uppercase tracking-[0.24em] text-foreground-secondary">
                Full Name
              </span>
              <input
                type="text"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                required
                className="w-full border-0 border-b border-border bg-transparent pb-3 font-primary text-base text-foreground outline-none transition-colors placeholder:text-foreground-muted focus:border-foreground-secondary"
              />
            </label>

            <label className="block space-y-3">
              <span className="font-primary text-xs uppercase tracking-[0.24em] text-foreground-secondary">
                Email
              </span>
              <input
                type="email"
                value={customer.email}
                disabled
                className="w-full cursor-not-allowed border-0 border-b border-border bg-transparent pb-3 font-primary text-base text-foreground-muted outline-none"
              />
            </label>

            <label className="block space-y-3">
              <span className="font-primary text-xs uppercase tracking-[0.24em] text-foreground-secondary">
                Phone
              </span>
              <input
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className="w-full border-0 border-b border-border bg-transparent pb-3 font-primary text-base text-foreground outline-none transition-colors placeholder:text-foreground-muted focus:border-foreground-secondary"
              />
            </label>

            {feedback ? (
              <p className="font-primary text-sm text-foreground-secondary">
                {feedback}
              </p>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="submit"
                disabled={isPending}
                className="inline-flex min-h-12 items-center justify-center border border-border bg-accent px-5 py-3 font-primary text-sm uppercase tracking-[0.18em] text-background transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface disabled:text-foreground-muted"
              >
                {isPending ? "Saving..." : "Save Changes"}
              </button>
              <button
                type="button"
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="inline-flex min-h-12 items-center justify-center border border-border px-5 py-3 font-primary text-sm uppercase tracking-[0.18em] text-foreground-secondary transition-colors hover:bg-surface hover:text-foreground disabled:cursor-not-allowed disabled:text-foreground-muted"
              >
                {isLoggingOut ? "Logging Out..." : "Logout"}
              </button>
            </div>
          </form>
        </div>
      </section>

      <section className="space-y-6 border-t border-border pt-8">
        <div className="space-y-2">
          <p className="font-primary text-xs uppercase tracking-[0.34em] text-foreground-secondary">
            Upcoming Appointments
          </p>
          <h2 className="font-display text-3xl uppercase tracking-[-0.04em] text-foreground sm:text-4xl">
            {upcomingAppointments.length > 0
              ? "Your Next Sessions"
              : "Nothing Scheduled Yet"}
          </h2>
          <p className="max-w-lg font-primary text-sm leading-7 text-foreground-secondary sm:text-base">
            {upcomingAppointments.length > 0
              ? "Your confirmed sessions appear here in Zurich local time."
              : "Your upcoming sessions will appear here after your first booking."}
          </p>
        </div>

        {upcomingAppointments.length > 0 ? (
          <div className="space-y-4">
            {upcomingAppointments.map((appointment) => (
              <div
                key={appointment.id}
                className="border border-border bg-surface px-5 py-5 sm:px-6"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-2">
                    <p className="font-display text-2xl uppercase tracking-[-0.04em] text-foreground">
                      {appointment.service_name}
                    </p>
                    <p className="font-primary text-sm leading-6 text-foreground-secondary">
                      {appointment.date_label}
                    </p>
                    <p className="font-primary text-xs uppercase tracking-[0.24em] text-foreground-muted">
                      {appointment.time_label}
                    </p>
                  </div>
                  <p className="font-primary text-xs uppercase tracking-[0.24em] text-foreground-secondary">
                    {appointment.status.replace("_", " ")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <a
          href="/#booking"
          className="inline-flex min-h-12 items-center justify-center border border-border bg-accent px-5 py-3 font-primary text-sm uppercase tracking-[0.18em] text-background transition-colors hover:bg-accent-hover"
        >
          Book a Session
        </a>
      </section>

      <section className="space-y-6 border-t border-border pt-8">
        <div className="space-y-2">
          <p className="font-primary text-xs uppercase tracking-[0.34em] text-foreground-secondary">
            Past Appointments
          </p>
          <h2 className="font-display text-3xl uppercase tracking-[-0.04em] text-foreground sm:text-4xl">
            Session History
          </h2>
        </div>

        {pastAppointments.length > 0 ? (
          <div className="space-y-4">
            {pastAppointments.map((appointment) => (
              <div
                key={appointment.id}
                className="border border-border bg-background px-5 py-5 sm:px-6"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-2">
                    <p className="font-display text-2xl uppercase tracking-[-0.04em] text-foreground">
                      {appointment.service_name}
                    </p>
                    <p className="font-primary text-sm leading-6 text-foreground-secondary">
                      {appointment.date_label}
                    </p>
                    <p className="font-primary text-xs uppercase tracking-[0.24em] text-foreground-muted">
                      {appointment.time_label}
                    </p>
                  </div>
                  <p className="font-primary text-xs uppercase tracking-[0.24em] text-foreground-secondary">
                    {appointment.status.replace("_", " ")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="max-w-lg font-primary text-sm leading-7 text-foreground-secondary sm:text-base">
            Past sessions will appear here after completed appointments.
          </p>
        )}
      </section>
    </div>
  );
}
