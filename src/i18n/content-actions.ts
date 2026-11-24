"use server";
import { requireAdminUser } from "@/lib/auth/customer";
import { revalidatePath } from "next/cache";
import { contentFields, isTextContent, type ContentTable } from "./content";

export async function saveContentTranslation(table: ContentTable, id: string, field: string, value: string, expected: string | null) {
  const { supabase } = await requireAdminUser();
  if (typeof table !== "string" || typeof id !== "string" || typeof field !== "string" || (expected !== null && typeof expected !== "string")) return { success: false };
  if (!Object.prototype.hasOwnProperty.call(contentFields, table) || !(contentFields[table] as readonly string[]).includes(field) || !/^[0-9a-f-]{36}$/i.test(id) || typeof value !== "string" || value.length > 20000) return { success: false };
  if (table === "homepage_content") {
    const { data, error } = await supabase.from(table).select("content_type,value").eq("id", id).single();
    if (error || !isTextContent(data?.content_type, data?.value)) return { success: false };
  }
  // Compare-and-set avoids overwriting another editor's concurrent translation.
  const column = `${field}_de`;
  let query = supabase.from(table).update({ [column]: value.trim() || null }).eq("id", id);
  query = expected === null ? query.is(column, null) : query.eq(column, expected);
  const { data, error } = await query.select("id");
  if (error || data?.length !== 1) return { success: false };
  for (const locale of ["de", "en"]) revalidatePath(`/${locale}`, "layout");
  revalidatePath("/", "layout");
  return { success: true };
}
