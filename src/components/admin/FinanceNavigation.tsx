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
    <nav aria-label="Finance sections" className="overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex min-w-max gap-8">
        {ITEMS.map((item) => {
          const active = item.href === "/admin/finance" ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`relative pb-4 font-admin-primary text-xs uppercase tracking-[0.2em] transition-colors ${active ? "text-accent after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-accent" : "text-foreground-muted hover:text-foreground"}`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
