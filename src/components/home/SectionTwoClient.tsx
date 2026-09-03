"use client";

import { useMemo } from "react";
import { useScrollVideoProgress } from "@/components/home/ScrollVideoSection";
import type { NextAvailabilityPreview } from "@/lib/public/booking-availability-utils";
import type { HomepageContent } from "@/lib/homepage-content-defaults";

function getRangeValue(progress: number, start: number, end: number) {
  return Math.min(Math.max((progress - start) / (end - start), 0), 1);
}

export default function SectionTwoClient({
  preview,
  hasError,
  content,
}: {
  preview: NextAvailabilityPreview | null;
  hasError: boolean;
  content: HomepageContent;
}) {
  const progress = useScrollVideoProgress();

  const labelStyle = useMemo(() => {
    const value = getRangeValue(progress, 0.44, 0.6);
    return {
      opacity: value,
      transform: `translate3d(0, ${(1 - value) * 22}px, 0)`,
    };
  }, [progress]);

  const headlineStyle = useMemo(() => {
    const value = getRangeValue(progress, 0.5, 0.68);
    return {
      opacity: value,
      transform: `translate3d(0, ${(1 - value) * 22}px, 0)`,
    };
  }, [progress]);

  const slotsStyle = useMemo(() => {
    const value = getRangeValue(progress, 0.56, 0.76);
    return {
      opacity: value,
      transform: `translate3d(0, ${(1 - value) * 24}px, 0)`,
    };
  }, [progress]);

  const dayLabel = preview?.label ?? "NO AVAILABILITY";
  const dateLabel = preview?.fullDateLabel ?? "NO FUTURE DATES AVAILABLE";
  const status = hasError
    ? "AVAILABILITY UNAVAILABLE"
    : preview?.status ?? "NO AVAILABILITY";
  const slots = preview?.slots ?? [];

  return (
    <section className="relative flex min-h-[60svh] items-start sm:min-h-[64svh] lg:min-h-[72vh]">
      <div className="page-container flex items-start py-6 sm:py-8 lg:py-10">
        <div className="max-w-2xl space-y-6">
          <div
            className="space-y-4 transition-[transform,opacity] duration-300 ease-out"
            style={labelStyle}
          >
            <p className="font-primary text-xs uppercase tracking-[0.34em] text-foreground-secondary">
              {content.availability_eyebrow}
            </p>
          </div>

          <div
            className="space-y-4 transition-[transform,opacity] duration-300 ease-out"
            style={headlineStyle}
          >
            <div className="space-y-2">
              <p className="font-primary text-xs uppercase tracking-[0.32em] text-foreground-muted">
                {dayLabel}
              </p>
              <h2 className="font-display max-w-xl text-[clamp(2.2rem,6vw,4.5rem)] font-semibold uppercase leading-[0.95] tracking-[-0.04em] text-foreground">
                {dateLabel}
              </h2>
            </div>
            <p className="font-primary text-sm uppercase tracking-[0.24em] text-foreground-secondary sm:text-base">
              {status}
            </p>
          </div>

          <div
            className="space-y-5 transition-[transform,opacity] duration-300 ease-out"
            style={slotsStyle}
          >
            {slots.length > 0 ? (
              <div className="flex flex-wrap gap-3 sm:gap-4">
                {slots.map((slot, index) => (
                  <button
                    key={slot}
                    type="button"
                    className={`min-h-11 border border-border px-4 py-3 font-primary text-sm uppercase tracking-[0.2em] text-foreground-secondary transition-colors hover:border-accent hover:text-foreground ${
                      index > 1 ? "hidden min-[390px]:inline-flex" : "inline-flex"
                    } items-center justify-center`}
                  >
                    {slot}
                  </button>
                ))}
              </div>
            ) : (
              <p className="font-primary text-sm uppercase tracking-[0.2em] text-foreground-muted">
                No availability in the current schedule window.
              </p>
            )}

            <a
              href="#booking"
              className="inline-flex min-h-12 items-center font-primary text-sm uppercase tracking-[0.2em] text-foreground-secondary transition-colors hover:text-accent"
            >
              {content.availability_cta}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
