"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { ServiceRecord } from "@/lib/services/types";
import type { HomepageContent } from "@/lib/homepage-content-defaults";

type ServicesProps = {
  services: ServiceRecord[];
  content: HomepageContent;
};

const fallbackServiceImage = "/images/hair.jpeg";

function formatDuration(service: ServiceRecord) {
  const min = service.duration_min;
  const max = service.duration_max ?? min;

  return min === max ? `${min} MIN` : `${min}–${max} MIN`;
}

function formatPrice(price: number) {
  return `CHF ${price.toFixed(0)}`;
}

export default function Services({ services, content }: ServicesProps) {
  const [activeServiceId, setActiveServiceId] = useState(
    services[0]?.id ?? "",
  );
  const [displayedServiceId, setDisplayedServiceId] = useState(
    services[0]?.id ?? "",
  );
  const [loadedServiceIds, setLoadedServiceIds] = useState<Set<string>>(
    () => new Set(),
  );
  const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeService =
    services.find(
      (service) => service.id === activeServiceId,
    ) ?? services[0];

  useEffect(() => () => {
    if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current);
  }, []);

  if (!activeService) {
    return null;
  }

  return (
    <section id="services" className="relative overflow-hidden bg-background">
      <div className="page-container page-grid-split items-center py-8 sm:py-10 lg:py-12">
        <div className="relative z-10 flex min-w-0 flex-col justify-between">
          <div className="space-y-4">
            <p className="font-primary text-xs uppercase tracking-[0.34em] text-foreground-secondary">
              {content.services_eyebrow}
            </p>
            <h2 className="font-display max-w-lg text-[clamp(2.2rem,6vw,4.5rem)] font-semibold uppercase leading-[0.95] tracking-[-0.04em] text-foreground">
              {content.services_title}
            </h2>
          </div>

          <div
            className="mt-8 flex flex-col border-t border-border lg:mt-10"
            role="tablist"
            aria-label="Signature services"
          >
            {services.map((service, index) => {
              const isActive =
                service.id === activeService.id;

              return (
                <button
                  key={service.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`service-panel-${service.id}`}
                  id={`service-tab-${service.id}`}
                  onMouseEnter={() =>
                    setActiveServiceId(service.id)
                  }
                  onFocus={() =>
                    setActiveServiceId(service.id)
                  }
                  onClick={() =>
                    setActiveServiceId(service.id)
                  }
                  className={`group flex w-full items-start justify-between gap-4 border-b border-border py-5 text-left transition-colors sm:py-6 ${
                    isActive
                      ? "text-foreground"
                      : "text-foreground-secondary hover:text-foreground"
                  }`}
                >
                  <div className="space-y-2 max-sm:min-w-0 max-sm:flex-1">
                    <div className="flex items-baseline gap-3 max-sm:gap-2">
                      <span className="font-primary text-xs uppercase tracking-[0.28em] text-foreground-muted max-sm:shrink-0 max-sm:text-foreground-secondary">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span
                        className={`font-display text-3xl uppercase tracking-[-0.04em] max-sm:min-w-0 max-sm:break-words max-sm:text-[clamp(1.5rem,6.5vw,1.875rem)] max-sm:leading-[1.15] sm:text-4xl ${
                          isActive
                            ? "text-foreground"
                            : "text-foreground-secondary"
                        }`}
                      >
                        {service.name}
                      </span>
                    </div>
                    <p
                      className={`font-primary text-sm uppercase tracking-[0.2em] max-sm:tracking-[0.12em] max-sm:text-foreground-secondary ${
                        isActive
                          ? "text-foreground-secondary"
                          : "text-foreground-muted"
                      }`}
                    >
                      {formatPrice(service.price)} ·{" "}
                      {formatDuration(service)}
                    </p>
                  </div>

                  <span
                    className={`mt-2 h-px w-10 transition-all max-sm:w-6 max-sm:shrink-0 ${
                      isActive
                        ? "bg-accent"
                        : "bg-border group-hover:bg-foreground-secondary"
                    }`}
                  />
                </button>
              );
            })}
          </div>
        </div>

        <div
          id={`service-panel-${activeService.id}`}
          role="tabpanel"
          aria-labelledby={`service-tab-${activeService.id}`}
          className="pointer-events-none absolute inset-0 w-full overflow-hidden bg-surface max-sm:z-0 sm:relative sm:inset-auto sm:w-full sm:max-w-[24rem] sm:self-center sm:justify-self-stretch md:max-w-[22rem] md:justify-self-end lg:max-w-[25rem] xl:max-w-[28rem]"
        >
          <div className="relative h-full w-full overflow-hidden bg-surface sm:h-auto sm:aspect-[5/6] md:aspect-square lg:aspect-[5/6]">
            {services
              .filter((service) => service.id === displayedServiceId || service.id === activeService.id)
              .map((service) => {
                const isActive = service.id === activeService.id;
                const isDisplayed = service.id === displayedServiceId;
                const isLoaded = loadedServiceIds.has(service.id);
                const isTransitionImage = isActive && !isDisplayed;
                return (
                  <Image
                    key={service.id}
                    src={service.image_url || fallbackServiceImage}
                    alt={isActive ? service.name : ""}
                    fill
                    loading={isTransitionImage ? "eager" : "lazy"}
                    quality={88}
                    sizes="(max-width: 639px) 100vw, (max-width: 1023px) 22rem, 28rem"
                    className={`object-cover object-center transition-opacity duration-500 ease-out ${isActive && isLoaded ? "z-10 opacity-100" : isDisplayed ? "opacity-100" : "opacity-0"}`}
                    draggable={false}
                    onLoad={() => {
                      setLoadedServiceIds((current) => {
                        if (current.has(service.id)) return current;
                        const next = new Set(current);
                        next.add(service.id);
                        return next;
                      });
                      if (service.id !== activeService.id) return;
                      if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current);
                      transitionTimeoutRef.current = setTimeout(() => setDisplayedServiceId(service.id), 500);
                    }}
                    onError={(event) => {
                      const image = event.currentTarget;
                      const originalSource = service.image_url || fallbackServiceImage;
                      const fallbackStage = image.dataset.fallbackStage;

                      image.srcset = "";
                      if (!fallbackStage && originalSource !== fallbackServiceImage) {
                        image.dataset.fallbackStage = "direct";
                        image.src = originalSource;
                        return;
                      }

                      if (fallbackStage !== "local" && originalSource !== fallbackServiceImage) {
                        image.dataset.fallbackStage = "local";
                        image.src = fallbackServiceImage;
                      }
                    }}
                  />
                );
              })}
            <div className="pointer-events-none absolute inset-0 z-20 bg-black/60 sm:hidden" />
            <div className="pointer-events-none absolute inset-0 z-20 bg-[linear-gradient(to_bottom,rgba(8,8,8,0.72)_0%,rgba(8,8,8,0.58)_36%,rgba(8,8,8,0.84)_100%)] sm:hidden" />
            <div className="pointer-events-none absolute inset-0 z-20 hidden bg-[linear-gradient(to_top,rgba(13,13,13,0.36)_0%,rgba(13,13,13,0.12)_36%,rgba(13,13,13,0.04)_100%)] sm:block" />
          </div>
        </div>
      </div>
    </section>
  );
}
