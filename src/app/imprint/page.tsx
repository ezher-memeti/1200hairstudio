
import { getTranslations } from "next-intl/server";
import BusinessDetails from "@/components/legal/BusinessDetails";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

export default async function ImprintPage() {
  const ui = await getTranslations("ui");

  return (
    <>
      <Header />
      <main className="bg-background [overflow-wrap:anywhere]">
        <section className="page-container py-12 sm:py-16 lg:py-20">
          <div className="max-w-3xl space-y-8">
            <div className="space-y-4">
              <p className="font-primary text-xs uppercase tracking-[0.34em] text-foreground-secondary">
                {ui("m902c91d94e0f")}</p>
              <h1 className="font-display text-[clamp(2.4rem,6vw,4.75rem)] font-semibold uppercase leading-[0.95] tracking-[-0.04em] text-foreground">
                {ui("mdb71e0bfdd6b")}</h1>
            </div>

            <div className="space-y-8 border-t border-border pt-8">
              <BusinessDetails imprint />
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
