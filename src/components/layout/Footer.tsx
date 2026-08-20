export default function Footer() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="page-container py-8 sm:py-10">
        <div className="flex flex-col gap-6 sm:gap-8 md:flex-row md:items-end md:justify-between">
          <div className="space-y-3">
            <p className="font-display text-base font-semibold uppercase tracking-[0.28em] text-foreground sm:text-lg">
              1200
            </p>
            <p className="font-primary text-sm leading-6 text-foreground-secondary">
              Schulstrasse 2, 8599 Salmsach
            </p>
          </div>

          <div className="flex flex-col gap-4 sm:gap-5 md:items-end">
            <a
              href="https://www.instagram.com/"
              target="_blank"
              rel="noreferrer"
              className="font-primary text-sm uppercase tracking-[0.2em] text-foreground-secondary transition-colors hover:text-foreground"
            >
              Instagram
            </a>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-5 md:justify-end">
              <span className="font-primary text-xs uppercase tracking-[0.2em] text-foreground-muted">
                © 1200 Hairstudio
              </span>
              <a
                href="/privacy"
                className="font-primary text-xs uppercase tracking-[0.2em] text-foreground-muted transition-colors hover:text-foreground-secondary"
              >
                Privacy
              </a>
              <a
                href="/imprint"
                className="font-primary text-xs uppercase tracking-[0.2em] text-foreground-muted transition-colors hover:text-foreground-secondary"
              >
                Imprint
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
