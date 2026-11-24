import { textFor } from "@/i18n/text";
import { translatedField } from "@/i18n/config";
import { getLocale } from "next-intl/server";
import { isTextContent, localizeRow } from "@/i18n/content";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import {
  homepageContentDefaults,
  homepageContentDefinitions,
  isHomepageContentKey,
  type HomepageContent,
  type HomepageContentKey,
  type HomepageContentSection,
  type HomepageContentType,
} from "@/lib/homepage-content-defaults";

export type HomepageContentRow = {
  id: string;
  section: string;
  content_key: string;
  label: string;
  value: string;
  value_de?: string | null;
  label_de?: string | null;
  content_type: HomepageContentType;
  sort_order: number;
  updated_at: string;
};

export type AdminHomepageContentField = {
  id: string | null;
  section: HomepageContentSection;
  contentKey: HomepageContentKey;
  label: string;
  value: string;
  valueDe: string;
  localized: boolean;
  contentType: HomepageContentType;
  sortOrder: number;
  recommendedMax: number;
};

function mergeRows(rows: HomepageContentRow[], locale: string): HomepageContent {
  const content = { ...homepageContentDefaults };
  for (const row of rows) {
    if (isHomepageContentKey(row.content_key) && typeof row.value === "string" && row.value.trim()) {
      content[row.content_key] = isTextContent(row.content_type, row.value) ? localizeRow(row, ["value"], locale).value : row.value;
    }
  }
  return content;
}

export const getHomepageContent = cache(async (): Promise<HomepageContent> => {
  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("homepage_content")
      .select("id,section,content_key,label,value,value_de,label_de,content_type,sort_order,updated_at")
      .order("section")
      .order("sort_order");

    if (error) return homepageContentDefaults;
    return mergeRows((data ?? []) as HomepageContentRow[], await getLocale());
  } catch {
    return homepageContentDefaults;
  }
});

export async function getAdminHomepageContent(): Promise<{
  configured: boolean;
  fields: AdminHomepageContentField[];
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("homepage_content")
    .select("id,section,content_key,label,value,value_de,label_de,content_type,sort_order,updated_at")
    .order("section")
    .order("sort_order");

  const rows = error ? [] : (data ?? []) as HomepageContentRow[];
  const rowsByKey = new Map(rows.map((row) => [row.content_key, row]));
  const locale = await getLocale();
  const fields = homepageContentDefinitions.map((definition) => {
    const row = rowsByKey.get(definition.contentKey);
    return {
      id: row?.id ?? null,
      section: definition.section,
      contentKey: definition.contentKey,
      label: textFor(locale, translatedField(row ?? { label: definition.label }, "label", locale)),
      value: row?.value ?? definition.defaultValue,
      valueDe: row?.value_de ?? "",
      localized: isTextContent(row?.content_type ?? definition.contentType, row?.value ?? definition.defaultValue),
      contentType: row?.content_type === "textarea" ? "textarea" as const : definition.contentType,
      sortOrder: row?.sort_order ?? definition.sortOrder,
      recommendedMax: definition.recommendedMax,
    };
  });

  return { configured: !error, fields };
}
