import "server-only";
import { getTranslations } from "next-intl/server";
import { getSiteMode } from "./site-mode";
// A mutation-layer gate also protects old forms and action requests sent to exempt URLs.
export async function publicBookingModeError(): Promise<string | null> {
  if (getSiteMode() === "live") return null;
  return (await getTranslations("siteMode"))("bookingUnavailable");
}
