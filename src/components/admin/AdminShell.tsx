"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import LogoutButton from "@/components/admin/LogoutButton";

const navigationItems = [
  { label: "Dashboard", href: "/admin" },
  { label: "Calendar", href: "/admin/calendar" },
  { label: "Appointments", href: "/admin/appointments" },
  { label: "Customers", href: "/admin/customers" },
  { label: "Marketing", href: "/admin/marketing" },
  { label: "Site Settings", href: "/admin/site-settings" },
  { label: "Finance", href: "/admin/finance" },
  { label: "Settings", href: "/admin/settings" },
] as const;

type AdminShellProps = {
  children: React.ReactNode;
};

export default function AdminShell({
  children,
}: AdminShellProps) {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

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
              className="font-display text-lg font-semibold uppercase tracking-[0.28em] text-foreground"
            >
              1200
            </Link>

            <nav className="mt-10 flex flex-1 flex-col gap-2" aria-label="Admin">
              {navigationItems.map((item) => {
                const isActive =
                  item.href === "/admin"
                    ? pathname === "/admin"
                    : pathname.startsWith(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`border px-4 py-3 font-primary text-sm uppercase tracking-[0.18em] transition-colors ${
                      isActive
                        ? "border-border bg-surface text-foreground"
                        : "border-transparent text-foreground-secondary hover:border-border hover:bg-surface hover:text-foreground"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="space-y-3 pt-6">
              <Link
                href="/"
                className="inline-flex w-full items-center justify-center border border-border px-4 py-3 font-primary text-sm uppercase tracking-[0.18em] text-foreground-muted transition-colors hover:bg-surface hover:text-foreground"
              >
                View Website ↗
              </Link>
              <LogoutButton fullWidth />
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-sm lg:hidden">
            <div className="page-container flex items-center justify-between py-4">
              <Link
                href="/admin"
                className="font-display text-base font-semibold uppercase tracking-[0.28em] text-foreground"
              >
                1200
              </Link>

              <button
                type="button"
                onClick={() => setIsMenuOpen((current) => !current)}
                aria-expanded={isMenuOpen}
                aria-controls="admin-mobile-menu"
                className="inline-flex size-11 items-center justify-center border border-border bg-surface text-foreground"
              >
                <span className="sr-only">Toggle admin navigation</span>
                <Menu size={20} />
              </button>
            </div>

            {isMenuOpen ? (
              <div id="admin-mobile-menu" className="fixed inset-0 z-[120] lg:hidden" role="dialog" aria-modal="true" aria-label="Admin navigation">
                <button type="button" className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setIsMenuOpen(false)} aria-label="Close admin navigation" />
                <div className="absolute inset-y-0 right-0 flex w-[min(88vw,22rem)] flex-col border-l border-border bg-background-secondary shadow-2xl">
                  <div className="flex min-h-16 items-center justify-between border-b border-border px-5 pt-[env(safe-area-inset-top)]">
                    <span className="font-display text-base font-semibold uppercase tracking-[0.28em] text-foreground">1200 Admin</span>
                    <button type="button" onClick={() => setIsMenuOpen(false)} className="inline-flex size-11 items-center justify-center border border-border text-foreground-secondary" aria-label="Close admin navigation"><X size={19} /></button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5">
                  <nav className="flex flex-col gap-2" aria-label="Admin mobile">
                    {navigationItems.map((item) => {
                      const isActive =
                        item.href === "/admin"
                          ? pathname === "/admin"
                          : pathname.startsWith(item.href);

                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setIsMenuOpen(false)}
                          className={`flex min-h-12 items-center border px-4 py-3 font-primary text-sm uppercase tracking-[0.18em] transition-colors ${
                            isActive
                              ? "border-border bg-surface text-foreground"
                              : "border-transparent text-foreground-secondary hover:border-border hover:bg-surface hover:text-foreground"
                          }`}
                        >
                          {item.label}
                        </Link>
                      );
                    })}
                  </nav>
                  </div>
                  <div className="space-y-3 border-t border-border px-4 py-4 pb-[max(16px,env(safe-area-inset-bottom))]">
                    <Link
                      href="/"
                      onClick={() => setIsMenuOpen(false)}
                      className="inline-flex w-full items-center justify-center border border-border px-4 py-3 font-primary text-sm uppercase tracking-[0.18em] text-foreground-muted transition-colors hover:bg-surface hover:text-foreground"
                    >
                      View Website ↗
                    </Link>
                    <LogoutButton fullWidth />
                  </div>
                </div>
              </div>
            ) : null}
          </header>

          <main className="page-container min-w-0 max-w-full py-6 sm:py-8 lg:px-8 lg:py-10 xl:px-10 xl:py-12">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
