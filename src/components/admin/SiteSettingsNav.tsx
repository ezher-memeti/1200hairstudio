"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

const siteSettingsItems = [
  { label: "Services", href: "/admin/site-settings/services" },
  { label: "Business Hours", href: "/admin/site-settings/business-hours" },
  { label: "Selected Work", href: "/admin/site-settings/selected-work" },
] as const;

export default function SiteSettingsNav() {
  const pathname = usePathname();

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="font-primary text-xs uppercase tracking-[0.34em] text-foreground-secondary">
          Site Settings
        </p>
        <h1 className="font-display text-[clamp(2rem,4vw,3.4rem)] font-semibold uppercase leading-[0.95] tracking-[-0.04em] text-foreground">
          Public Site
        </h1>
      </div>

      <nav aria-label="Site settings sections" className="hidden lg:block">
        <div className="w-full max-w-[16rem] space-y-2 border-r border-border pr-6">
          {siteSettingsItems.map((item) => {
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block border px-4 py-3 font-primary text-sm uppercase tracking-[0.18em] transition-colors ${
                  isActive
                    ? "border-border bg-surface text-foreground"
                    : "border-transparent text-foreground-secondary hover:border-border hover:bg-surface hover:text-foreground"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <nav aria-label="Site settings tabs" className="lg:hidden">
        <div className="-mx-5 overflow-x-auto px-5 sm:-mx-6 sm:px-6">
          <div className="flex min-w-max gap-2">
            {siteSettingsItems.map((item) => {
              const isActive = pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex min-h-11 items-center justify-center whitespace-nowrap border px-4 py-2 font-primary text-xs uppercase tracking-[0.18em] transition-colors ${
                    isActive
                      ? "border-border bg-surface text-foreground"
                      : "border-transparent text-foreground-secondary hover:border-border hover:bg-surface hover:text-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
    </div>
  );
}
