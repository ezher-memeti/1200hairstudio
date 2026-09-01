"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
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

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="lg:grid lg:min-h-screen lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="hidden border-r border-border bg-background-secondary lg:flex lg:flex-col">
          <div className="flex h-full flex-col px-6 py-8">
            <a
              href="/admin"
              className="font-display text-lg font-semibold uppercase tracking-[0.28em] text-foreground"
            >
              1200
            </a>

            <nav className="mt-10 flex flex-1 flex-col gap-2" aria-label="Admin">
              {navigationItems.map((item) => {
                const isActive =
                  item.href === "/admin"
                    ? pathname === "/admin"
                    : pathname.startsWith(item.href);

                return (
                  <a
                    key={item.href}
                    href={item.href}
                    className={`border px-4 py-3 font-primary text-sm uppercase tracking-[0.18em] transition-colors ${
                      isActive
                        ? "border-border bg-surface text-foreground"
                        : "border-transparent text-foreground-secondary hover:border-border hover:bg-surface hover:text-foreground"
                    }`}
                  >
                    {item.label}
                  </a>
                );
              })}
            </nav>

            <div className="space-y-3 pt-6">
              <a
                href="/"
                className="inline-flex w-full items-center justify-center border border-border px-4 py-3 font-primary text-sm uppercase tracking-[0.18em] text-foreground-muted transition-colors hover:bg-surface hover:text-foreground"
              >
                View Website ↗
              </a>
              <LogoutButton fullWidth />
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="border-b border-border bg-background/95 backdrop-blur-sm lg:hidden">
            <div className="page-container flex items-center justify-between py-4">
              <a
                href="/admin"
                className="font-display text-base font-semibold uppercase tracking-[0.28em] text-foreground"
              >
                1200
              </a>

              <button
                type="button"
                onClick={() => setIsMenuOpen((current) => !current)}
                aria-expanded={isMenuOpen}
                aria-controls="admin-mobile-menu"
                className="inline-flex items-center justify-center border border-border bg-surface p-2 text-foreground"
              >
                <span className="sr-only">Toggle admin navigation</span>
                <span className="flex h-4 w-5 flex-col justify-between">
                  <span className="block h-px w-full bg-current" />
                  <span className="block h-px w-full bg-current" />
                  <span className="block h-px w-full bg-current" />
                </span>
              </button>
            </div>

            {isMenuOpen ? (
              <div id="admin-mobile-menu" className="border-t border-border">
                <div className="page-container py-4">
                  <nav className="flex flex-col gap-2" aria-label="Admin mobile">
                    {navigationItems.map((item) => {
                      const isActive =
                        item.href === "/admin"
                          ? pathname === "/admin"
                          : pathname.startsWith(item.href);

                      return (
                        <a
                          key={item.href}
                          href={item.href}
                          onClick={() => setIsMenuOpen(false)}
                          className={`border px-4 py-3 font-primary text-sm uppercase tracking-[0.18em] transition-colors ${
                            isActive
                              ? "border-border bg-surface text-foreground"
                              : "border-transparent text-foreground-secondary hover:border-border hover:bg-surface hover:text-foreground"
                          }`}
                        >
                          {item.label}
                        </a>
                      );
                    })}
                  </nav>

                  <div className="pt-4">
                    <a
                      href="/"
                      onClick={() => setIsMenuOpen(false)}
                      className="inline-flex w-full items-center justify-center border border-border px-4 py-3 font-primary text-sm uppercase tracking-[0.18em] text-foreground-muted transition-colors hover:bg-surface hover:text-foreground"
                    >
                      View Website ↗
                    </a>
                  </div>

                  <div className="pt-4">
                    <LogoutButton fullWidth />
                  </div>
                </div>
              </div>
            ) : null}
          </header>

          <main className="page-container py-8 sm:py-10 lg:px-10 lg:py-12 xl:px-12">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
