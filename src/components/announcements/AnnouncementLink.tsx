import { useLocale } from "next-intl";
import { localizedPath, resolveLocale } from "@/i18n/config";
import type { ReactNode } from "react";

export default function AnnouncementLink({ href, children, className, newTab = false }: { href: string; children: ReactNode; className: string; newTab?: boolean }) {
  const locale = resolveLocale(useLocale());
  const external = /^https?:\/\//i.test(href);
  const openInNewTab = external || newTab;
  return <a href={localizedPath(href, locale)} className={className} target={openInNewTab ? "_blank" : undefined} rel={openInNewTab ? "noopener noreferrer" : undefined}>{children}</a>;
}
