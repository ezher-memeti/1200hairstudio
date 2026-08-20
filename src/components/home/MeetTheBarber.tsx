import Image from "next/image";

export default function MeetTheBarber() {
  return (
    <section id="barber" className="bg-background-secondary">
      <div className="page-container page-grid-split-reverse items-center py-8 sm:py-10 lg:py-12">
        <div className="space-y-4 md:col-start-2 md:row-start-1 md:self-end">
          <p className="font-primary text-xs uppercase tracking-[0.34em] text-foreground-secondary">
            03 / The Barber
          </p>
          <p className="font-display text-[clamp(2.2rem,6vw,4.5rem)] font-semibold uppercase leading-[0.95] tracking-[-0.04em] text-foreground">
            Meet the Barber
          </p>
        </div>

        <div className="relative w-full max-w-[24rem] self-center overflow-hidden bg-surface md:row-span-2 md:max-w-[22rem] md:justify-self-start lg:max-w-[25rem] xl:max-w-[28rem]">
          <div className="relative aspect-square w-full">
            <Image
              src="/images/barber.jpeg"
              alt="Portrait of the barber"
              fill
              className="object-cover"
              sizes="(min-width: 768px) 50vw, 100vw"
            />
          </div>
        </div>

        <div className="flex min-w-0 items-center md:col-start-2 md:row-start-2 md:justify-self-end">
          <div className="w-full space-y-8 md:max-w-[40rem] lg:space-y-10">
            <div className="space-y-6 border-t border-border pt-6 lg:pt-8">
              <h2 className="font-display text-5xl font-semibold uppercase leading-none tracking-[-0.05em] text-foreground sm:text-6xl lg:text-7xl">
                Arban Shaqiri
              </h2>

              <div className="space-y-2">
                <p className="font-display text-3xl font-semibold uppercase tracking-[-0.04em] text-foreground sm:text-4xl">
                  4
                </p>
                <p className="font-primary text-sm uppercase tracking-[0.22em] text-foreground-secondary sm:text-base">
                  Years Experience
                </p>
              </div>

              <p className="font-primary text-sm uppercase tracking-[0.22em] text-foreground-secondary sm:text-base">
                Fade · Classic · Beard
              </p>
            </div>

            <div className="pt-2">
              <a
                href="#booking"
                className="inline-flex min-h-12 items-center border border-border bg-accent px-5 py-3 font-primary text-sm uppercase tracking-[0.18em] text-background transition-colors hover:bg-accent-hover"
              >
                Book a Session →
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
