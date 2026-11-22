import { isLocale, type Locale } from "./config";

export type ContentDraft = { german?: Record<string, string> };
export function draftText(draft: ContentDraft, field: string, source: string | null | undefined, locale: Locale): string {
  return locale === "de" ? draft.german?.[field] ?? "" : source ?? "";
}
export function draftChange(field: string, value: string, locale: Locale, draft: ContentDraft) {
  return locale === "de" ? { german: { ...draft.german, [field]: value } } : { [field]: value };
}

// Build database payloads only from an explicit server-owned field list. On update,
// the inactive language is omitted entirely, even if the client sends both drafts.
export function contentPayload<T extends Record<string, unknown>>(payload: T, fields: readonly string[], locale: unknown, german: unknown, creating = false): Record<string, unknown> {
  if (!isLocale(locale)) throw new Error("Invalid content language.");
  const translations = german && typeof german === "object" && !Array.isArray(german) ? german as Record<string, unknown> : {};
  const result: Record<string, unknown> = { ...payload };
  for (const field of fields) {
    if (locale === "de" || creating) {
      const value = translations[field];
      if (value !== undefined && (typeof value !== "string" || value.length > 20000)) throw new Error("Invalid translated content.");
      result[`${field}_de`] = typeof value === "string" ? value.trim() || null : null;
    }
    if (!creating && locale === "de") delete result[field];
  }
  return result;
}
