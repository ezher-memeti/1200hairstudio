 "use client";

import { useMemo } from "react";
import { useScrollVideoProgress } from "@/components/home/ScrollVideoSection";
import type { HomepageContent } from "@/lib/homepage-content-defaults";

export default function Hero({ content }: { content: HomepageContent }) {
  const progress = useScrollVideoProgress();
  const animation = useMemo(() => {
    const fadeOutStart = 0.34;
    const fadeOutEnd = 0.56;
    const fadeOutProgress = Math.min(
      Math.max((progress - fadeOutStart) / (fadeOutEnd - fadeOutStart), 0),
      1,
    );

    return {
      opacity: 1 - fadeOutProgress,
      transform: `translate3d(0, ${fadeOutProgress * -24}px, 0)`,
    };
  }, [progress]);

  return (
    <section id="top" className="relative flex min-h-[76svh] items-center sm:min-h-[80svh] lg:min-h-[82vh]">
      <div className="page-container-hero grid min-h-[76svh] grid-cols-1 gap-8 py-8 sm:min-h-[80svh] sm:gap-10 sm:py-10 lg:min-h-[82vh] lg:grid-cols-12 lg:gap-8 lg:py-12">
        <div
          className="flex flex-col justify-between transition-[transform,opacity] duration-300 ease-out lg:col-span-7 lg:pr-10 xl:pr-12"
          style={animation}
        >
          <div className="max-w-2xl space-y-6 pt-4 sm:space-y-7 sm:pt-6 lg:pt-10">
            <p className="font-primary text-xs uppercase tracking-[0.34em] text-foreground-secondary">
              {content.hero_eyebrow}
            </p>
            <h1 className="font-display max-w-[11ch] text-[clamp(2.8rem,9vw,6.5rem)] font-semibold uppercase leading-[0.92] tracking-[-0.04em] text-foreground">
              {content.hero_title}
            </h1>
            <p className="font-primary max-w-md text-sm leading-7 text-foreground-secondary sm:text-base lg:text-lg">
              {content.hero_description}
            </p>
            <div className="pt-2">
              <a
                href="#booking"
                className="inline-flex min-h-12 items-center border border-border bg-accent px-5 py-3 font-primary text-sm uppercase tracking-[0.18em] text-background transition-colors hover:bg-accent-hover"
              >
                {content.hero_cta}
              </a>
            </div>
          </div>

          <div className="hidden pt-6 lg:block">
            <p className="font-primary text-xs uppercase tracking-[0.32em] text-foreground-muted">
              {content.hero_scroll_label}
            </p>
          </div>
        </div>

        {/* <div className="flex items-center lg:col-span-5 lg:justify-end">
          <div className="w-full space-y-8 lg:max-w-[24rem]">
            <div className="border-t border-border pt-4">
              <p className="max-w-[14rem] text-xs uppercase tracking-[0.28em] text-foreground-secondary">
                Shared moving image stays fixed while the opening story unfolds
                across two full-screen sections.
              </p>
            </div>
            <div className="flex justify-between border-t border-border pt-4">
              <p className="text-xs uppercase tracking-[0.28em] text-foreground-muted">
                Chair study
              </p>
              <p className="text-xs uppercase tracking-[0.28em] text-foreground-muted">
                01
              </p>
            </div>
          </div>
        </div> */}

        <div className="pt-1 lg:hidden">
          <p className="font-primary text-xs uppercase tracking-[0.32em] text-foreground-muted">
            {content.hero_scroll_label}
          </p>
        </div>
      </div>
    </section>
  );
}
