"use client";

import Image from "next/image";
import { useState } from "react";

const services = [
  {
    id: "hair",
    index: "01",
    title: "Hair",
    details: "CHF 25 · 30–60 MIN",
    image: "/images/hair.jpeg",
  },
  {
    id: "kid",
    index: "02",
    title: "Kid",
    details: "CHF 20 · 30 MIN",
    image: "/images/kid.jpeg",
  },
  {
    id: "hair-beard",
    index: "03",
    title: "Hair + Beard",
    details: "CHF 35 · 45–60 MIN",
    image: "/images/hair-beard.jpeg",
  },
] as const;

type ServiceId = (typeof services)[number]["id"];

export default function Services() {
  const [activeServiceId, setActiveServiceId] =
    useState<ServiceId>(services[0].id);

  const activeService =
    services.find(
      (service) => service.id === activeServiceId,
    ) ?? services[0];

  return (
    <section id="services" className="bg-background">
      <div className="page-container page-grid-split items-center py-8 sm:py-10 lg:py-12">
        <div className="flex min-w-0 flex-col justify-between">
          <div className="space-y-4">
            <p className="font-primary text-xs uppercase tracking-[0.34em] text-foreground-secondary">
              Signature Services
            </p>
            <h2 className="font-display max-w-lg text-[clamp(2.2rem,6vw,4.5rem)] font-semibold uppercase leading-[0.95] tracking-[-0.04em] text-foreground">
              Crafted cuts, clean rhythm, considered detail.
            </h2>
          </div>

          <div
            className="mt-8 flex flex-col border-t border-border lg:mt-10"
            role="tablist"
            aria-label="Signature services"
          >
            {services.map((service) => {
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
                  className={`group flex w-full items-start justify-between gap-4 border-b border-border py-5 text-left transition-colors sm:py-6 ${isActive
                    ? "text-foreground"
                    : "text-foreground-secondary hover:text-foreground"
                    }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-baseline gap-3">
                      <span className="font-primary text-xs uppercase tracking-[0.28em] text-foreground-muted">
                        {service.index}
                      </span>
                      <span
                        className={`font-display text-3xl uppercase tracking-[-0.04em] sm:text-4xl ${isActive
                          ? "text-foreground"
                          : "text-foreground-secondary"
                          }`}
                      >
                        {service.title}
                      </span>
                    </div>
                    <p
                      className={`font-primary text-sm uppercase tracking-[0.2em] ${isActive
                        ? "text-foreground-secondary"
                        : "text-foreground-muted"
                        }`}
                    >
                      {service.details}
                    </p>
                  </div>

                  <span
                    className={`mt-2 h-px w-10 transition-all ${isActive
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
          className="relative w-full max-w-[24rem] self-center justify-self-stretch overflow-hidden bg-surface md:max-w-[22rem] md:justify-self-end lg:max-w-[25rem] xl:max-w-[28rem]"
        >
          <div className="relative aspect-[5/6] w-full md:aspect-square lg:aspect-[5/6]">
            <Image
              src={activeService.image}
              alt={activeService.title}
              fill
              className="object-cover"
              sizes="(min-width: 1280px) 480px, (min-width: 1024px) 432px, (min-width: 768px) 352px, 100vw"
            />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(13,13,13,0.36)_0%,rgba(13,13,13,0.12)_36%,rgba(13,13,13,0.04)_100%)]" />
          </div>
        </div>
      </div>
    </section>
  );
}
