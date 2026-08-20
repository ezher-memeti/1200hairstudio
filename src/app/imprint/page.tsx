import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

export default function ImprintPage() {
  return (
    <>
      <Header />
      <main className="bg-background">
        <section className="page-container py-12 sm:py-16 lg:py-20">
          <div className="max-w-3xl space-y-8">
            <div className="space-y-4">
              <p className="font-primary text-xs uppercase tracking-[0.34em] text-foreground-secondary">
                Legal
              </p>
              <h1 className="font-display text-[clamp(2.4rem,6vw,4.75rem)] font-semibold uppercase leading-[0.95] tracking-[-0.04em] text-foreground">
                Imprint
              </h1>
            </div>

            <div className="space-y-8 border-t border-border pt-8">
              <div className="space-y-2">
                <h2 className="font-display text-2xl uppercase tracking-[-0.04em] text-foreground sm:text-3xl">
                  1200 Hairstudio
                </h2>
                <p className="font-primary text-base leading-7 text-foreground-secondary">
                  Schulstrasse 2
                  <br />
                  8599 Salmsach
                  <br />
                  Switzerland
                </p>
              </div>

              <dl className="space-y-6">
                <div className="space-y-2 border-t border-border pt-6">
                  <dt className="font-primary text-xs uppercase tracking-[0.24em] text-foreground-muted">
                    Owner / Responsible Person
                  </dt>
                  <dd className="font-primary text-base leading-7 text-foreground-secondary">
                    [PLACEHOLDER]
                  </dd>
                </div>

                <div className="space-y-2 border-t border-border pt-6">
                  <dt className="font-primary text-xs uppercase tracking-[0.24em] text-foreground-muted">
                    Email
                  </dt>
                  <dd className="font-primary text-base leading-7 text-foreground-secondary">
                    [PLACEHOLDER]
                  </dd>
                </div>

                <div className="space-y-2 border-t border-border pt-6">
                  <dt className="font-primary text-xs uppercase tracking-[0.24em] text-foreground-muted">
                    Phone
                  </dt>
                  <dd className="font-primary text-base leading-7 text-foreground-secondary">
                    [PLACEHOLDER]
                  </dd>
                </div>

                <div className="space-y-2 border-t border-border pt-6">
                  <dt className="font-primary text-xs uppercase tracking-[0.24em] text-foreground-muted">
                    Business / UID Information
                  </dt>
                  <dd className="font-primary text-base leading-7 text-foreground-secondary">
                    [PLACEHOLDER]
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
