import { textFor } from "@/i18n/text";
import type { Locale } from "@/i18n/config";
export function buildMarketingFooter(unsubscribeUrl: string, locale: Locale = "de") {
  const t = (value: string) => textFor(locale, value);
  return {
    html: `<div style="margin-top:32px;padding-top:24px;border-top:1px solid #2a2a2a;color:#888;font-size:12px;line-height:1.7">1200 Hairstudio<br>Schulstrasse 2, 8599 Salmsach, Switzerland<br><br>${t("This is a marketing email from 1200 Hairstudio.")} <a href="${unsubscribeUrl}" style="color:#d1ad76">${t("Unsubscribe")}</a></div>`,
    text: `\n\n1200 Hairstudio\nSchulstrasse 2, 8599 Salmsach, Switzerland\n${t("This is a marketing email from 1200 Hairstudio.")}\n${t("Unsubscribe")}: ${unsubscribeUrl}`,
  };
}
