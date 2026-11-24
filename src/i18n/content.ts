import englishContent from "../../messages/content-en.json";
import { translatedField, type Locale } from "./config";
export const contentFields = {
  services: ["name"],
  announcements: ["title", "message", "cta_text"],
  selected_work: ["title"],
  homepage_content: ["label", "value"],
  contact_section_settings: ["eyebrow", "title", "description", "call_cta_label", "instagram_cta_label", "leave_review_cta_label"],
  marketing_templates: ["name", "description", "default_subject", "default_preheader", "default_headline", "default_content", "default_cta_text"],
} as const;
export type ContentTable = keyof typeof contentFields;
export function localizeRow<T extends object>(row: T, fields: readonly string[], locale: string): T {
  const next = { ...row } as Record<string, unknown>;
  for (const field of fields) {
    if (field in next) next[field] = locale === "en" && typeof next[field] === "string" ? (englishContent as Record<string,string>)[String(next[field])] ?? next[field] : translatedField(row, field as keyof T, locale);
  }
  return next as T;
}
export function isTextContent(type: unknown, value: unknown): boolean {
  return (type === "text" || type === "textarea") && typeof value === "string" && !/^\s*(?:https?:|\/|data:|blob:|\{|\[)/i.test(value);
}
export function localizedContent<T extends object>(row: T, fields: readonly string[], locale: Locale): T { return localizeRow(row, fields, locale); }

export function englishContentText(value: string): string { return (englishContent as Record<string,string>)[value] ?? value; }

export function localizedServiceName(locale: Locale, source: string, german?: string | null): string {
  return locale === "de" ? german?.trim() || source : englishContentText(source);
}
