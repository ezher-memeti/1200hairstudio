import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ModeContact, ModeFooter, ModeHeader } from "./shared";
import styles from "./site-mode.module.css";

export default async function UnderConstruction() {
  const t = await getTranslations("siteMode");
  // Keep the request locale explicit for the essential account route.
  const locale = await getLocale();
  return <div className={`${styles.frame} ${styles.maintenance}`} data-site-mode="under_construction">
    <div className={styles.architecture} aria-hidden="true"><span /><span /></div>
    <ModeHeader />
    <main className={`${styles.maintenanceMain} ${styles.reveal}`}>
      <div className={styles.maintenanceHeading}><p className={styles.eyebrow}>{t("maintenance.eyebrow")}</p><h1 className={styles.maintenanceTitle}>{t("maintenance.headline")}</h1><p className={styles.motto}>{t("motto")}</p></div>
      <div className={styles.maintenanceCopy}><span className={styles.goldRule} aria-hidden="true" /><p className={styles.description}>{t("maintenance.description")}</p><p className={styles.reassurance}>{t("maintenance.reassurance")}</p><ModeContact /><div className={styles.appointmentNote}><p>{t("maintenance.note")}</p><Link href="/account" locale={locale}>{t("manageAppointment")}<span aria-hidden="true">↗</span></Link></div></div>
    </main>
    <ModeFooter />
  </div>;
}
