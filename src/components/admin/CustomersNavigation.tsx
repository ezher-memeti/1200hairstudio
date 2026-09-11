"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/customers/emails", label: "Email History" },
];

export default function CustomersNavigation() {
  const pathname = usePathname();
  return <nav aria-label="Customer sections" className="overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"><div className="flex min-w-max gap-7">{items.map((item) => { const active = pathname === item.href; return <Link key={item.href} href={item.href} className={`inline-flex min-h-12 items-center border-b-2 font-admin-primary text-[10px] uppercase tracking-[.18em] transition-colors ${active ? "border-accent text-accent" : "border-transparent text-foreground-muted hover:text-foreground"}`}>{item.label}</Link>; })}</div></nav>;
}
