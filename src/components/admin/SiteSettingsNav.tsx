"use client";
import { useUiText } from "@/i18n/use-ui-text";

import { useTranslations } from "next-intl";


import { usePathname } from "@/i18n/navigation";
import Link from "@/components/admin/AdminNavLink";

const siteSettingsItems = [
  { label: "Notifications", href: "/admin/site-settings/notifications" },
  { label: "Homepage Content", href: "/admin/site-settings/homepage-content" },
  { label: "Services", href: "/admin/site-settings/services" },
  { label: "Business Hours", href: "/admin/site-settings/business-hours" },
  { label: "Selected Work", href: "/admin/site-settings/selected-work" },
  { label: "Contact", href: "/admin/site-settings/contact" },
  { label: "Announcements", href: "/admin/site-settings/announcements" },
  { label: "Loyalty", href: "/admin/site-settings/loyalty" },
] as const;

export default function SiteSettingsNav() {
  const uiText = useUiText();

  const ui = useTranslations("ui");

  const pathname = usePathname();

  return (
    <header>
      <div>
        <p className="font-admin-primary text-[10px] uppercase tracking-[0.22em] text-foreground-muted">
          {ui("ma77370cde551")}</p>
        <h1 className="mt-2 font-admin-display text-3xl font-semibold text-foreground sm:text-4xl">
          {ui("mb37012a88577")}</h1>
        <p className="mt-3 max-w-2xl font-admin-primary text-sm leading-6 text-foreground-secondary">
          {ui("m804546c6b393")}</p>
      </div>

      <nav
        aria-label={ui("mf994404dde6d")}
        className="-mx-5 mt-7 overflow-x-auto overscroll-x-contain scroll-smooth border-b border-border px-5 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0 [&::-webkit-scrollbar]:hidden"
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
                {uiText(item.label)}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
