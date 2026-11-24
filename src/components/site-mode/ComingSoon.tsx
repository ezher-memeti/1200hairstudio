import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { ModeContact, ModeFooter, ModeHeader } from "./shared";
import styles from "./site-mode.module.css";

export default async function ComingSoon() {
  const t = await getTranslations("siteMode");
  return <div className={`${styles.frame} ${styles.coming}`} data-site-mode="coming_soon">
    <div className={styles.photograph} aria-hidden="true"><Image src="/images/background-work.webp" alt="" fill priority sizes="(min-width: 1024px) 43vw, 100vw" className={styles.photo} /></div>
    <ModeHeader />
    <main className={`${styles.comingMain} ${styles.reveal}`}>
      <p className={styles.eyebrow}><span className={styles.goldRule} aria-hidden="true" />{t("coming.eyebrow")}</p>
      <h1 className={styles.comingTitle} aria-label={t("coming.headline")}><span>{t("coming.first")}</span><em>{t("coming.second")}</em></h1>
      <div className={styles.comingCopy}><p className={styles.motto}>{t("motto")}</p><p className={styles.description}>{t("coming.description")}</p><ModeContact /></div>
    </main>
    <p className={styles.imageCaption} aria-hidden="true">{t("coming.imageLabel")}</p>
    <ModeFooter />
  </div>;
}
