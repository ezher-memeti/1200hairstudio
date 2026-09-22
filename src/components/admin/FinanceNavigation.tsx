"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { label: "Overview", href: "/admin/finance" },
  { label: "Transactions", href: "/admin/finance/transactions" },
  { label: "Sales", href: "/admin/finance/sales" },
  { label: "Receipts", href: "/admin/finance/receipts" },
  { label: "Register", href: "/admin/finance/register" },
  { label: "End of Day", href: "/admin/finance/end-of-day" },
  { label: "Reports", href: "/admin/finance/reports" },
];

export default function FinanceNavigation() {
  const pathname = usePathname();

  return (
    <nav aria-label="Finance sections" className="-mx-5 overflow-x-auto overscroll-x-contain scroll-smooth border-b border-border px-5 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0 [&::-webkit-scrollbar]:hidden">
      <div className="flex min-w-max flex-nowrap gap-6 pr-5 sm:gap-8 sm:pr-6 lg:w-full lg:justify-between lg:pr-0">
        {ITEMS.map((item) => {
          const active = item.href === "/admin/finance" ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`relative inline-flex min-h-12 shrink-0 items-center whitespace-nowrap pb-1 font-admin-primary text-[10px] uppercase tracking-[0.18em] transition-colors sm:text-xs sm:tracking-[0.2em] ${active ? "text-accent after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-accent" : "text-foreground-muted hover:text-foreground"}`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
