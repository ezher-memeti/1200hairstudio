import "server-only";
import { redirect as nextRedirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { headers } from "next/headers";
import { isLocale, localizedPath, resolveLocale } from "./config";
export async function redirect(path: string): Promise<never> {
  nextRedirect(localizedPath(path, resolveLocale(await getLocale())));
}

export async function getActiveBookingLocale(fallback?: unknown) {
  try {
    const locale = (await headers()).get("x-next-intl-locale");
    return isLocale(locale) ? locale : resolveLocale(fallback);
  } catch {
    return resolveLocale(fallback);
  }
}
