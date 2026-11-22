import { getRequestConfig } from "next-intl/server";
import { headers } from "next/headers";
import { resolveLocale } from "./config";
export default getRequestConfig(async () => {
  const locale = resolveLocale((await headers()).get("x-next-intl-locale"));
  return { locale, timeZone: "Europe/Zurich", messages: (await import(`../../messages/${locale}.json`)).default };
});
