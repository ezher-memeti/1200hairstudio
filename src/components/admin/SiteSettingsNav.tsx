"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

const siteSettingsItems = [
  { label: "Homepage Content", href: "/admin/site-settings/homepage-content" },
  { label: "Services", href: "/admin/site-settings/services" },
  { label: "Business Hours", href: "/admin/site-settings/business-hours" },
  { label: "Selected Work", href: "/admin/site-settings/selected-work" },
  { label: "Announcements", href: "/admin/site-settings/announcements" },
] as const;

export default function SiteSettingsNav() {
  const pathname = usePathname();

  return (
    <header>
      <div>
        <p className="font-admin-primary text-[10px] uppercase tracking-[0.22em] text-foreground-muted">
          Site Management
        </p>
        <h1 className="mt-2 font-admin-display text-3xl font-semibold text-foreground sm:text-4xl">
          Site Settings
        </h1>
        <p className="mt-3 max-w-2xl font-admin-primary text-sm leading-6 text-foreground-secondary">
          Manage public website content, services, availability, and gallery.
        </p>
      </div>

      <nav
        aria-label="Site settings sections"
        className="-mx-5 mt-7 overflow-x-auto border-b border-border px-5 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0"
      >
        <div className="flex min-w-max">
          {siteSettingsItems.map((item) => {
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`inline-flex min-h-11 shrink-0 items-center border-b-2 px-5 font-admin-primary text-[10px] uppercase tracking-[0.18em] outline-none transition-colors focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent ${
                  isActive
                    ? "border-accent text-accent"
                    : "border-transparent text-foreground-muted hover:text-foreground"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
