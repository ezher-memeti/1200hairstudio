"use client";
import { useUiText } from "@/i18n/use-ui-text";

import { useTranslations } from "next-intl";


import Link from "@/components/admin/AdminNavLink";
import { usePathname } from "@/i18n/navigation";

const items = [
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/customers/emails", label: "Email History" },
];

export default function CustomersNavigation() {
  const uiText = useUiText();

  const ui = useTranslations("ui");

  const pathname = usePathname();
  return <nav aria-label={ui("m40034627ceec")} className="overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"><div className="flex min-w-max gap-7">{items.map((item) => { const active = pathname === item.href; return <Link key={item.href} href={item.href} className={`inline-flex min-h-12 items-center border-b-2 font-admin-primary text-[10px] uppercase tracking-[.18em] transition-colors ${active ? "border-accent text-accent" : "border-transparent text-foreground-muted hover:text-foreground"}`}>{uiText(item.label)}</Link>; })}</div></nav>;
}
