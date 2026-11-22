"use client";
import { useLocale as useInterfaceLocale } from "next-intl";
import { textFor as interfaceText } from "@/i18n/text";

import { useLocale, useTranslations } from "next-intl";
import { useTransition, useState } from "react";
import { usePathname } from "@/i18n/navigation";
import { locales, localizedPath } from "@/i18n/config";
import { saveLocalePreference } from "@/i18n/preferences";
export default function LanguageSwitcher() {
  const interfaceLocale = useInterfaceLocale();
  const displayText = (value: string) => interfaceText(interfaceLocale, value);

  const locale = useLocale();
  const copy = useTranslations("communication");
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const [error, setError] = useState(false);
  return <div className="flex shrink-0 items-center gap-2 font-primary text-[10px] tracking-[0.12em]" role="group" aria-label={displayText("Deutsch / English")}>
    {locales.map(value => <button key={value} type="button" disabled={pending} aria-pressed={locale === value}
      className={locale === value ? "text-accent" : "text-foreground-secondary hover:text-foreground"}
      onClick={() => start(async () => {
        setError(false);
        const result = await saveLocalePreference(value);
        if (!result.success) { setError(true); return; }
        // A document navigation refreshes the root HTML language and server metadata too.
        window.location.assign(localizedPath(`${pathname}${window.location.search}${window.location.hash}`, value));
      })}>{value.toUpperCase()}</button>)}
    {error && <span role="alert">{copy("saveError")}</span>}
  </div>;
}
