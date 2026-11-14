export default function AdminPageLoading() {
  return (
    <section role="status" aria-label="Loading admin page" data-admin-loading className="min-w-0 space-y-6" aria-busy="true">
      <p className="font-admin-primary text-xs uppercase tracking-[0.18em] text-foreground-secondary">Loading page…</p>
      <div aria-hidden="true" className="space-y-6 animate-pulse motion-reduce:animate-none">
        <div className="h-9 w-64 max-w-full bg-surface" />
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((item) => <div key={item} className="h-28 border border-border bg-surface" />)}
        </div>
        <div className="h-64 border border-border bg-surface" />
      </div>
    </section>
  );
}
