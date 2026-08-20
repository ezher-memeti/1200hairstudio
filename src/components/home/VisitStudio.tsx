export default function VisitStudio() {
  return (
    <section id="visit" className="bg-background">
      <div className="page-container page-grid-split items-center py-10 sm:py-12 lg:py-14">
        <div className="flex min-w-0 flex-col justify-center">
          <div className="max-w-xl space-y-5">
            <p className="font-primary text-xs uppercase tracking-[0.34em] text-foreground-secondary">
              Visit the Studio
            </p>
            <h2 className="font-display text-[clamp(2.2rem,6vw,4.5rem)] font-semibold uppercase leading-[0.95] tracking-[-0.04em] text-foreground">
              Salmsach
              <br />
              Switzerland
            </h2>

            <div className="space-y-6 border-t border-border pt-6 lg:pt-8">
              <div className="space-y-1">
                <p className="font-primary text-base leading-7 text-foreground-secondary sm:text-lg">
                  Schulstrasse 2
                </p>
                <p className="font-primary text-base leading-7 text-foreground-secondary sm:text-lg">
                  8599 Salmsach
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-6 border-b border-border pb-3">
                  <span className="font-primary text-sm uppercase tracking-[0.22em] text-foreground">
                    Mon–Fri
                  </span>
                  <span className="font-primary text-sm uppercase tracking-[0.22em] text-foreground-secondary">
                    09:00–18:00
                  </span>
                </div>
                <div className="flex items-center justify-between gap-6 border-b border-border pb-3">
                  <span className="font-primary text-sm uppercase tracking-[0.22em] text-foreground">
                    Sat
                  </span>
                  <span className="font-primary text-sm uppercase tracking-[0.22em] text-foreground-secondary">
                    09:00–17:00
                  </span>
                </div>
                <div className="flex items-center justify-between gap-6">
                  <span className="font-primary text-sm uppercase tracking-[0.22em] text-foreground">
                    Sun
                  </span>
                  <span className="font-primary text-sm uppercase tracking-[0.22em] text-foreground-muted">
                    Closed
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <a
                href="https://www.google.com/maps/search/?api=1&query=Schulstrasse+2,+8599+Salmsach,+Switzerland"
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-12 items-center border border-border bg-accent px-5 py-3 font-primary text-sm uppercase tracking-[0.18em] text-background transition-colors hover:bg-accent-hover"
              >
                Get Directions →
              </a>
            </div>
          </div>
        </div>

        <div className="relative w-full self-center justify-self-stretch overflow-hidden bg-surface">
          <div className="relative aspect-[5/4] min-h-[20rem] w-full sm:min-h-[24rem] lg:min-h-[28rem]">
            <iframe
              title="1200 Barbershop studio location"
              src="https://www.google.com/maps?q=Schulstrasse%202,%208599%20Salmsach,%20Switzerland&z=15&output=embed"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="absolute inset-0 h-full w-full border-0 grayscale sepia-[0.12] contrast-[1.2] brightness-[0.55] saturate-[0.15]"
            />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(13,13,13,0.18)_0%,rgba(13,13,13,0.08)_36%,rgba(13,13,13,0.03)_100%)]" />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(13,13,13,0.18)_0%,rgba(13,13,13,0.1)_28%,rgba(13,13,13,0.04)_60%,rgba(13,13,13,0.1)_100%)]" />
          </div>
        </div>
      </div>
    </section>
  );
}
