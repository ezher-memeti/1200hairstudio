type PlaceholderPageProps = {
  label: string;
  title: string;
  description: string;
};

export default function PlaceholderPage({
  label,
  title,
  description,
}: PlaceholderPageProps) {
  return (
    <section className="space-y-8">
      <div className="space-y-4">
        <p className="font-primary text-xs uppercase tracking-[0.34em] text-foreground-secondary">
          {label}
        </p>
        <h1 className="font-display text-[clamp(2.2rem,5vw,4.25rem)] font-semibold uppercase leading-[0.95] tracking-[-0.04em] text-foreground">
          {title}
        </h1>
        <p className="max-w-2xl font-primary text-sm leading-7 text-foreground-secondary sm:text-base">
          {description}
        </p>
      </div>
    </section>
  );
}
