import { getBusinessSettings } from "@/lib/admin/runtime-settings";
import { getLocale, getTranslations } from "next-intl/server";
import { businessAddress, businessEmailHref, businessPhoneHref } from "@/lib/business/identity";
export default async function BusinessDetails({ imprint = false }: { imprint?: boolean }) {
  const [business, locale, t] = await Promise.all([getBusinessSettings(), getLocale(), getTranslations("businessIdentity")]);
  const link = "underline underline-offset-4 transition-colors hover:text-foreground";
  return <div className="space-y-6 font-primary text-base leading-7 text-foreground-secondary">
    <div><p className={imprint ? "font-display text-2xl uppercase tracking-[-0.04em] text-foreground sm:text-3xl" : "text-foreground"}>{business.businessName}</p>{businessAddress(business, locale).map(line => <p key={line}>{line}</p>)}</div>
    <dl className="space-y-6">
      <div className={imprint ? "space-y-2 border-t border-border pt-6" : ""}><dt className="text-xs uppercase tracking-[0.24em] text-foreground-muted">{t("owner")}</dt><dd className="mt-2">{business.ownerName}</dd></div>
      <div className={imprint ? "space-y-2 border-t border-border pt-6" : ""}><dt className="text-xs uppercase tracking-[0.24em] text-foreground-muted">{t("email")}</dt><dd className="mt-2"><a className={link} href={businessEmailHref(business.email)}>{business.email}</a></dd></div>
      <div className={imprint ? "space-y-2 border-t border-border pt-6" : ""}><dt className="text-xs uppercase tracking-[0.24em] text-foreground-muted">{t("phone")}</dt><dd className="mt-2"><a className={link} href={businessPhoneHref(business.phone)}>{business.phone}</a></dd></div>
      {imprint && business.uid && <div className={imprint ? "space-y-2 border-t border-border pt-6" : ""}><dt className="text-xs uppercase tracking-[0.24em] text-foreground-muted">{t("uid")}</dt><dd className="mt-2">{business.uid}</dd></div>}
    </dl>
  </div>;
}
