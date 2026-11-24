import { createTranslator } from "next-intl";
import en from "../../messages/en.json";
import de from "../../messages/de.json";
import type { Locale } from "./config";
export function communicationTranslator(locale: Locale) {
  return createTranslator({ locale, messages: locale === "de" ? de.communication : en.communication });
}
