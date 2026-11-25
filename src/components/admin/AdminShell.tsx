"use client";
import { useUiText } from "@/i18n/use-ui-text";

import { useTranslations } from "next-intl";


import { usePathname } from "@/i18n/navigation";
import Link from "@/components/admin/AdminNavLink";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import NotificationCenter from "@/components/admin/notifications/NotificationCenter";
import LogoutButton from "@/components/admin/LogoutButton";
import LanguageSwitcher from "@/components/layout/LanguageSwitcher";
import BrandLogo from "@/components/brand/BrandLogo";

const navigationItems = [
  { label: "Dashboard", href: "/admin" },
  { label: "Calendar", href: "/admin/calendar" },
  { label: "Appointments", href: "/admin/appointments" },
  { label: "Customers", href: "/admin/customers" },
  { label: "Marketing", href: "/admin/marketing" },
  { label: "Site Settings", href: "/admin/site-settings/services" },
  { label: "Finance", href: "/admin/finance" },
  { label: "Settings", href: "/admin/settings" },
] as const;

type AdminShellProps = {
  children: React.ReactNode;
};

export default function AdminShell({
  children,
}: AdminShellProps) {
  const uiText = useUiText();

  const ui = useTranslations("ui");

  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isMenuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMenuOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isMenuOpen]);

  return (
    <div className="min-h-screen max-w-full overflow-x-clip bg-background text-foreground">
      <div className="lg:grid lg:min-h-screen lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="hidden border-r border-border bg-background-secondary lg:flex lg:flex-col">
          <div className="flex h-full flex-col px-6 py-8">
            <Link
              href="/admin"
              className="inline-flex min-h-11 items-center self-start"
              aria-label={ui("m62d5151269cb")}
            >
              <BrandLogo className="h-6 w-32" priority />
            </Link>

            <nav className="mt-10 flex flex-1 flex-col gap-2" aria-label={ui("m4e7afebcfbae")}>
              {navigationItems.map((item) => {
                const isActive =
                  item.href === "/admin"
                    ? pathname === "/admin"
                    : pathname.startsWith(item.href.startsWith("/admin/site-settings/") ? "/admin/site-settings" : item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`min-w-0 break-words border px-4 py-3 font-primary text-sm uppercase tracking-[0.1em] transition-colors ${
                      isActive
                        ? "border-border bg-surface text-foreground"
                        : "border-transparent text-foreground-secondary hover:border-border hover:bg-surface hover:text-foreground"
                    }`}
                  >
                    {uiText(item.label)}
                  </Link>
                );
              })}
            </nav>

            <div className="space-y-3 pt-6">
              <Link
                href="/"
                className="inline-flex w-full items-center justify-center border border-min-w-0 break-words border px-4 py-3 font-primary text-sm uppercase tracking-[0.1em] text-foreground-muted transition-colors hover:bg-surface hover:text-foreground"
              >
                {ui("m417365b751a8")}</Link>
              <LanguageSwitcher /><LogoutButton fullWidth />
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-50 border-b border-border bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur-sm">
            <div className="page-container flex min-h-16 items-center justify-between py-2">
              <Link
                href="/admin"
                className="inline-flex min-h-11 items-center lg:invisible"
                aria-label={ui("m62d5151269cb")}
              >
                <BrandLogo className="h-5 w-28 sm:h-6 sm:w-32" priority />
              </Link>

              <div className="flex items-center gap-2"><NotificationCenter />
              <button
                type="button"
                onClick={() => setIsMenuOpen((current) => !current)}
                aria-expanded={isMenuOpen}
                aria-controls="admin-mobile-menu"
                className="inline-flex size-11 items-center justify-center border border-border bg-surface text-foreground lg:hidden"
              >
                <span className="sr-only">{ui("m24eeb6e9cdfa")}</span>
                {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
              </button></div>
            </div>
          </header>

            {isMenuOpen ? (
              <div id="admin-mobile-menu" className="fixed inset-0 z-[120] lg:hidden" role="dialog" aria-modal="true" aria-label={ui("m8ce001cf182b")}>
                <button type="button" className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setIsMenuOpen(false)} aria-label={ui("md14115136da4")} />
                <div className="absolute inset-y-0 right-0 flex w-[min(88vw,22rem)] flex-col border-l border-border bg-background-secondary shadow-2xl">
                  <div className="flex min-h-16 items-center justify-between border-b border-border px-5 pt-[env(safe-area-inset-top)]">
                    <div className="flex min-w-0 items-center gap-2">
                      <BrandLogo className="h-5 w-28" />
                      <span className="hidden font-primary text-[10px] uppercase tracking-[0.12em] text-foreground-muted sm:inline">{ui("m4e7afebcfbae")}</span>
                    </div>
                    <button type="button" onClick={() => setIsMenuOpen(false)} className="inline-flex size-11 items-center justify-center border border-border text-foreground-secondary" aria-label={ui("md14115136da4")}><X size={19} /></button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5">
                  <nav className="flex flex-col gap-2" aria-label={ui("maaafba518f00")}>
                    {navigationItems.map((item) => {
                      const isActive =
                        item.href === "/admin"
                          ? pathname === "/admin"
                          : pathname.startsWith(item.href.startsWith("/admin/site-settings/") ? "/admin/site-settings" : item.href);

                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => { if (pathname === item.href) setIsMenuOpen(false); }}
                          className={`flex min-h-12 items-center min-w-0 break-words border px-4 py-3 font-primary text-sm uppercase tracking-[0.1em] transition-colors ${
                            isActive
                              ? "border-border bg-surface text-foreground"
                              : "border-transparent text-foreground-secondary hover:border-border hover:bg-surface hover:text-foreground"
                          }`}
                        >
                          {uiText(item.label)}
                        </Link>
                      );
                    })}
                  </nav>
                  </div>
                  <div className="space-y-3 border-t border-border px-4 py-4 pb-[max(16px,env(safe-area-inset-bottom))]">
                    <Link
                      href="/admin/settings"
                      onClick={() => { if (pathname === "/admin/settings") setIsMenuOpen(false); }}
                      className="inline-flex min-h-12 w-full items-center justify-center border border-min-w-0 break-words border px-4 py-3 font-primary text-sm uppercase tracking-[0.1em] text-foreground-secondary transition-colors hover:bg-surface hover:text-foreground"
                    >
                      {ui("mff4fc0276e96")}</Link>
                    <Link
                      href="/"
                      onClick={() => setIsMenuOpen(false)}
                      className="inline-flex w-full items-center justify-center border border-min-w-0 break-words border px-4 py-3 font-primary text-sm uppercase tracking-[0.1em] text-foreground-muted transition-colors hover:bg-surface hover:text-foreground"
                    >
                      {ui("m417365b751a8")}</Link>
                    <LanguageSwitcher /><LogoutButton fullWidth />
                  </div>
                </div>
              </div>
            ) : null}

          <main className="page-container min-w-0 max-w-full py-6 sm:py-8 lg:px-8 lg:py-10 xl:px-10 xl:py-12">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
