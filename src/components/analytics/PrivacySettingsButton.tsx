"use client";
import { useTranslations } from "next-intl";
import { PRIVACY_SETTINGS_EVENT } from "@/lib/analytics/consent";
import styles from "./analytics-consent.module.css";

export default function PrivacySettingsButton({ className = "" }: { className?: string }) {
  const t = useTranslations("analytics");
  return <button type="button" className={`${styles.privacyControl} ${className}`} aria-haspopup="dialog" aria-controls="cookie-preferences" onClick={() => window.dispatchEvent(new Event(PRIVACY_SETTINGS_EVENT))}>{t("settings")}</button>;
}
