"use client";

import { useState } from "react";
import {
  serviceImageClass,
  serviceImageContainerClass,
  serviceImageFrameClass,
  serviceImageOverlayClass,
} from "@/config/service-ui";
import type { ServiceRecord } from "@/lib/services/types";
import type { HomepageContent } from "@/lib/homepage-content-defaults";

type ServicesProps = {
  services: ServiceRecord[];
  content: HomepageContent;
};

const fallbackServiceImage = "/images/services/hair.jpg";

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

  const activeService =
    services.find(
      (service) => service.id === activeServiceId,
    ) ?? services[0];

  if (!activeService) {
    return null;
  }

  return (
    <section id="services" className="bg-background">
      <div className="page-container page-grid-split items-center py-8 sm:py-10 lg:py-12">
        <div className="flex min-w-0 flex-col justify-between">
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
                  <div className="space-y-2">
                    <div className="flex items-baseline gap-3">
                      <span className="font-primary text-xs uppercase tracking-[0.28em] text-foreground-muted">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span
                        className={`font-display text-3xl uppercase tracking-[-0.04em] sm:text-4xl ${
                          isActive
                            ? "text-foreground"
                            : "text-foreground-secondary"
                        }`}
                      >
                        {service.name}
                      </span>
                    </div>
                    <p
                      className={`font-primary text-sm uppercase tracking-[0.2em] ${
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
                    className={`mt-2 h-px w-10 transition-all ${
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
          className={serviceImageContainerClass}
        >
          <div className={serviceImageFrameClass}>
            <img
              src={
                activeService.image_url || fallbackServiceImage
              }
              alt={activeService.name}
              className={serviceImageClass}
              draggable={false}
            />
            <div className={serviceImageOverlayClass} />
          </div>
        </div>
      </div>
    </section>
  );
}
