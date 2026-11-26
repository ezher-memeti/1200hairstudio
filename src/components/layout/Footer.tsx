import { getBusinessSettings } from "@/lib/admin/runtime-settings";
import { businessPhoneHref, businessEmailHref } from "@/lib/business/identity";
import DeveloperCredit from "./DeveloperCredit";
import PrivacySettingsButton from "@/components/analytics/PrivacySettingsButton";

import { Link as LocaleLink } from "@/i18n/navigation";

import { getTranslations } from "next-intl/server";
import { getPublicContactSectionSettings } from "@/lib/contact-section/settings";
import { type HomepageContent } from "@/lib/homepage-content-defaults";
import BrandLogo from "@/components/brand/BrandLogo";

export default async function Footer(_props: { content?: HomepageContent }) {
  const [ui, contact, business] = await Promise.all([getTranslations("ui"), getPublicContactSectionSettings(), getBusinessSettings()]);
  let instagramUrl: string | null = null;
  if (contact?.isEnabled && contact.instagramEnabled) {
    try {
      const url = new URL(contact.instagramUrl);
      if (url.protocol === "https:" && /(^|\.)instagram\.com$/.test(url.hostname) && !url.username && !url.password) instagramUrl = url.href;
    } catch { /* Omit unconfigured social links. */ }
  }

  return (
    <footer className="border-t border-border bg-background">
      <div className="page-container py-8 sm:py-10">
        <div className="flex flex-col gap-6 sm:gap-8 md:flex-row md:items-end md:justify-between">
          <div className="space-y-3">
            <BrandLogo className="h-6 w-32 sm:h-7 sm:w-36" />
            <p className="font-primary text-sm leading-6 text-foreground-secondary">
              {business.addressLine}, {business.postalCode} {business.city}
            </p>
            <p className="flex flex-wrap gap-x-4 gap-y-1 break-words font-primary text-xs text-foreground-secondary"><a href={businessEmailHref(business.email)} className="hover:text-foreground">{business.email}</a><a href={businessPhoneHref(business.phone)} className="hover:text-foreground">{business.phone}</a></p>
          </div>

          <div className="flex flex-col gap-4 sm:gap-5 md:items-end">
            {instagramUrl ? <a
              href={instagramUrl}
              data-analytics="instagram" data-analytics-contact="instagram"
              target="_blank"
              rel="noopener noreferrer"
              className="font-primary text-sm uppercase tracking-[0.2em] text-foreground-secondary transition-colors hover:text-foreground"
            >
              Instagram
            </a> : null}

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-5 md:justify-end">
              <span className="font-primary text-xs uppercase tracking-[0.2em] text-foreground-muted">
                © {business.businessName}
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
              <span className="font-primary text-xs uppercase tracking-[0.2em] text-foreground-muted transition-colors hover:text-foreground-secondary"><PrivacySettingsButton /></span>
            </div>
            <DeveloperCredit />
          </div>
        </div>
      </div>
    </footer>
  );
}
