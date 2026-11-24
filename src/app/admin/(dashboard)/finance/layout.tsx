
import { useTranslations } from "next-intl";
import FinanceNavigation from "@/components/admin/FinanceNavigation";

export default function FinanceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const ui = useTranslations("ui");

  return (
    <section className="space-y-7">
      <header>
        <p className="font-admin-primary text-xs uppercase tracking-[0.34em] text-foreground-secondary">{ui("m3c6cd921d566")}</p>
        <h1 className="mt-4 font-admin-display text-[clamp(2.2rem,5vw,4.25rem)] font-semibold uppercase leading-[0.95] tracking-[-0.04em] text-foreground">{ui("m1b48d3f01424")}</h1>
        <p className="mt-3 font-admin-primary text-sm text-foreground-secondary">{ui("me09e5d270e1e")}</p>
      </header>
      <FinanceNavigation />
      {children}
    </section>
  );
}
