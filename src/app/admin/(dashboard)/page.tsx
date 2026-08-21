export default function AdminDashboardPage() {
  const stats = [
    {
      label: "Today’s Appointments",
      value: "04",
      detail: "Friday, August 21, 2026",
    },
    {
      label: "Revenue",
      value: "CHF 420",
      detail: "Placeholder daily total",
    },
    {
      label: "Next Appointment",
      value: "14:30",
      detail: "Hair + Beard",
    },
  ] as const;

  return (
    <section className="space-y-8">
      <div className="space-y-4">
        <p className="font-primary text-xs uppercase tracking-[0.34em] text-foreground-secondary">
          Dashboard
        </p>
        <h1 className="font-display text-[clamp(2.2rem,5vw,4.25rem)] font-semibold uppercase leading-[0.95] tracking-[-0.04em] text-foreground">
          1200 Admin
        </h1>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {stats.map((stat) => (
          <article
            key={stat.label}
            className="border border-border bg-surface px-5 py-6 sm:px-6"
          >
            <p className="font-primary text-xs uppercase tracking-[0.24em] text-foreground-muted">
              {stat.label}
            </p>
            <p className="mt-4 font-display text-4xl font-semibold uppercase leading-none tracking-[-0.04em] text-foreground sm:text-5xl">
              {stat.value}
            </p>
            <p className="mt-3 font-primary text-sm uppercase tracking-[0.2em] text-foreground-secondary">
              {stat.detail}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
