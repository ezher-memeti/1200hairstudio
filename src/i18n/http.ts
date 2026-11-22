import { isLocale, localeCookie, defaultLocale } from "./config";
// Export routes are deliberately unprefixed. Accept only the same two display locales.
export function requestLocale(request: Request) {
  const explicit = new URL(request.url).searchParams.get("locale");
  if (isLocale(explicit)) return explicit;
  const value = request.headers.get("cookie")?.split(";").map(part => part.trim()).find(part => part.startsWith(`${localeCookie}=`))?.slice(localeCookie.length + 1);
  return isLocale(value) ? value : defaultLocale;
}
