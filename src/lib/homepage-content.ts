import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
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
  contentType: HomepageContentType;
  sortOrder: number;
  recommendedMax: number;
};

function mergeRows(rows: HomepageContentRow[]): HomepageContent {
  const content = { ...homepageContentDefaults };
  for (const row of rows) {
    if (isHomepageContentKey(row.content_key) && typeof row.value === "string" && row.value.trim()) {
      content[row.content_key] = row.value;
    }
  }
  return content;
}

export const getHomepageContent = cache(async (): Promise<HomepageContent> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("homepage_content")
      .select("id,section,content_key,label,value,content_type,sort_order,updated_at")
      .order("section")
      .order("sort_order");

    if (error) return homepageContentDefaults;
    return mergeRows((data ?? []) as HomepageContentRow[]);
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
    .select("id,section,content_key,label,value,content_type,sort_order,updated_at")
    .order("section")
    .order("sort_order");

  const rows = error ? [] : (data ?? []) as HomepageContentRow[];
  const rowsByKey = new Map(rows.map((row) => [row.content_key, row]));
  const fields = homepageContentDefinitions.map((definition) => {
    const row = rowsByKey.get(definition.contentKey);
    return {
      id: row?.id ?? null,
      section: definition.section,
      contentKey: definition.contentKey,
      label: row?.label?.trim() || definition.label,
      value: row?.value ?? definition.defaultValue,
      contentType: row?.content_type === "textarea" ? "textarea" as const : definition.contentType,
      sortOrder: row?.sort_order ?? definition.sortOrder,
      recommendedMax: definition.recommendedMax,
    };
  });

  return { configured: !error, fields };
}

