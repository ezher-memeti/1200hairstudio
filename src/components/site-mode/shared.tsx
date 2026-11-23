import BrandLogo from "@/components/brand/BrandLogo";
import LanguageSwitcher from "@/components/layout/LanguageSwitcher";
import { getTranslations } from "next-intl/server";
import { getPublicContactSectionSettings } from "@/lib/contact-section/settings";
import styles from "./site-mode.module.css";
import ModeArrow from "./ModeArrow";

export async function ModeHeader() {
  const t = await getTranslations("siteMode");
  return <header className={styles.header}><div aria-label={t("brand")}><BrandLogo className="h-6 w-32" priority /></div><nav aria-label={t("language")} className={styles.localeSwitch}><LanguageSwitcher /></nav></header>;
}
export async function ModeContact() {
  const t = await getTranslations("siteMode");
  let settings;
  try { settings = await getPublicContactSectionSettings(); } catch { return null; }
  if (!settings?.isEnabled) return null;
  let instagram: string | null = null;
  try {
    const url = new URL(settings.instagramUrl);
    if (settings.instagramEnabled && url.protocol === "https:" && /(^|\.)instagram\.com$/i.test(url.hostname)) instagram = url.href;
  } catch { /* Optional configured action. No constructed social URL. */ }
  const phone = settings.phoneNumber.replace(/[^+\d]/g, "");
  return <div className={styles.contacts}>
    {instagram ? <a href={instagram} target="_blank" rel="noopener noreferrer">{t("instagram")}<ModeArrow /></a> : null}
    {/[0-9]{5}/.test(phone) ? <a href={`tel:${phone}`}>{t("contact")}<ModeArrow /></a> : null}
  </div>;
}
export async function ModeFooter() {
  const t = await getTranslations("siteMode");
  return <footer className={styles.footer}><span>{t("brand")}</span><span>{t("location")}</span><span className={styles.footerNote}>{t("footer")}</span></footer>;
}
