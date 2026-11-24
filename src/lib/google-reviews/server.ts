import "server-only";
import { cache } from "react";
import type { GoogleReview, GoogleReviews } from "./types";

export const GOOGLE_REVIEWS_FIELDS = "displayName,rating,userRatingCount,reviews,googleMapsUri,googleMapsLinks,attributions";
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function text(value: unknown): string | null { return typeof value === "string" && value.trim() ? value : null; }
function https(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}
function rating(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 5 ? value : null;
}
export function parseGoogleReviews(value: unknown): GoogleReviews | null {
  const place = record(value);
  const mapsUri = https(place.googleMapsUri);
  const name = text(record(place.displayName).text);
  if (!mapsUri || !name || !Number.isSafeInteger(place.userRatingCount) || Number(place.userRatingCount) < 0) return null;
  const links = record(place.googleMapsLinks);
  const reviews: GoogleReview[] = [];
  for (const raw of Array.isArray(place.reviews) ? place.reviews : []) {
    const review = record(raw), author = record(review.authorAttribution);
    const authorName = text(author.displayName), uri = https(review.googleMapsUri), stars = rating(review.rating);
    if (!authorName || !uri || stars === null) continue;
    // Preserve the original language, rather than silently presenting a translation.
    const original = record(review.originalText), translated = record(review.text);
    const content = typeof original.text === "string" ? original : translated;
    const published = text(review.publishTime);
    const publishedAt = published && Number.isFinite(Date.parse(published)) ? new Date(published).toISOString() : null;
    reviews.push({ id: text(review.name) ?? uri, author: authorName, authorUri: https(author.uri),
      avatarUri: https(author.photoUri), rating: stars, text: typeof content.text === "string" ? content.text : "",
      language: text(content.languageCode), relativeDate: text(review.relativePublishTimeDescription) ?? (publishedAt ? new Intl.DateTimeFormat("en", { month: "short", year: "numeric", timeZone: "Europe/Zurich" }).format(new Date(publishedAt)) : ""),
      publishedAt, uri });
  }
  return { name, rating: rating(place.rating), count: Number(place.userRatingCount), mapsUri,
    reviewsUri: https(links.reviewsUri) ?? mapsUri,
    writeUri: https(links.writeAReviewUri),
    reviews,
    attributions: (Array.isArray(place.attributions) ? place.attributions : []).flatMap((raw) => {
      const a = record(raw), provider = text(a.provider);
      return provider ? [{ name: provider, uri: https(a.providerUri) }] : [];
    }),
  };
}

// React cache deduplicates within one server render only. No ISR/Data Cache,
// disk, database or cross-request cache of Google review content.
export const getGoogleReviews = cache(async (): Promise<GoogleReviews | null> => {
  const key = process.env.GOOGLE_PLACES_API_KEY?.trim();
  const placeId = process.env.GOOGLE_PLACE_ID?.trim();
  if (!key || !placeId) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=en`, {
      headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": GOOGLE_REVIEWS_FIELDS },
      cache: "no-store", redirect: "error", signal: controller.signal,
    });
    if (!response.ok) { console.warn("GOOGLE REVIEWS UNAVAILABLE", { status: response.status }); return null; }
    return parseGoogleReviews(await response.json());
  } catch { console.warn("GOOGLE REVIEWS UNAVAILABLE", { code: "request_failed" }); return null; }
  finally { clearTimeout(timer); }
});
