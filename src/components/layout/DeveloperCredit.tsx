import { useTranslations } from "next-intl";
import { developerCredit } from "@/lib/developer-credit";
import styles from "./developer-credit.module.css";

export default function DeveloperCredit({ className = "" }: { className?: string }) {
  const t = useTranslations("developerCredit");
  return <span className={`${styles.credit} ${className}`}>
    <span>{developerCredit.prefix}</span>{" "}
    <a
      href={developerCredit.linkedInUrl}
      aria-label={t("linkLabel", { name: developerCredit.name })}
      target="_blank"
      rel="noopener noreferrer"
      data-analytics="footer_developer_link"
      className={styles.link}
    >{developerCredit.name}</a>
  </span>;
}
