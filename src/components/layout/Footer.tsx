
import { Link as LocaleLink } from "@/i18n/navigation";

import { useTranslations } from "next-intl";
import { homepageContentDefaults, type HomepageContent } from "@/lib/homepage-content-defaults";
import BrandLogo from "@/components/brand/BrandLogo";

export default function Footer({ content = homepageContentDefaults }: { content?: HomepageContent }) {
  const ui = useTranslations("ui");

  return (
    <footer className="border-t border-border bg-background">
      <div className="page-container py-8 sm:py-10">
        <div className="flex flex-col gap-6 sm:gap-8 md:flex-row md:items-end md:justify-between">
          <div className="space-y-3">
            <BrandLogo className="h-6 w-32 sm:h-7 sm:w-36" />
            <p className="font-primary text-sm leading-6 text-foreground-secondary">
              {content.visit_address_line_1}, {content.visit_address_line_2}
            </p>
          </div>

          <div className="flex flex-col gap-4 sm:gap-5 md:items-end">
            <a
              href="https://www.instagram.com/"
              target="_blank"
              rel="noreferrer"
              className="font-primary text-sm uppercase tracking-[0.2em] text-foreground-secondary transition-colors hover:text-foreground"
            >
              Instagram
            </a>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-5 md:justify-end">
              <span className="font-primary text-xs uppercase tracking-[0.2em] text-foreground-muted">
                © 1200 Hairstudio
              </span>
              <LocaleLink
                href="/privacy"
                className="font-primary text-xs uppercase tracking-[0.2em] text-foreground-muted transition-colors hover:text-foreground-secondary"
              >
                {ui("mcf01481f626d")}</LocaleLink>
              <LocaleLink
                href="/imprint"
                className="font-primary text-xs uppercase tracking-[0.2em] text-foreground-muted transition-colors hover:text-foreground-secondary"
              >
                {ui("mdb71e0bfdd6b")}</LocaleLink>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
