"use server";

import { isLocale, type Locale } from "@/i18n/config";
import { isTextContent } from "@/i18n/content";
import { revalidatePath } from "next/cache";
import { requireAdminUser } from "@/lib/auth/customer";
import {
  homepageContentDefinitions,
  type HomepageContentKey,
  type HomepageContentSection,
} from "@/lib/homepage-content-defaults";

type HomepageContentUpdate = { contentKey: HomepageContentKey; value: string };
type SaveResult = { success: boolean; message: string; unsavedKeys?: HomepageContentKey[] };

export async function saveHomepageContentSection(
  section: HomepageContentSection,
  updates: HomepageContentUpdate[],
  locale: Locale = "en",
): Promise<SaveResult> {
  try {
    const { supabase } = await requireAdminUser();
    if (!isLocale(locale)) return { success: false, message: "Invalid content language." };
    const allowedKeys = new Set(
      homepageContentDefinitions
        .filter((field) => field.section === section)
        .map((field) => field.contentKey),
    );

    if (!allowedKeys.size || updates.length !== allowedKeys.size || new Set(updates.map(update => update.contentKey)).size !== allowedKeys.size) {
      return { success: false, message: "The submitted homepage section is incomplete." };
    }

    const normalized = updates.map((update) => ({
      contentKey: update.contentKey,
      value: update.value.trim(),
    }));

    if (normalized.some((update) => !allowedKeys.has(update.contentKey) || (locale === "en" && !update.value))) {
      return { success: false, message: "All homepage content fields in this section are required." };
    }

    for (let index = 0; index < normalized.length; index++) {
      const update = normalized[index];
      const unsavedKeys = normalized.slice(index).map(field => field.contentKey);
      const { data: existing, error: lookupError } = await supabase.from("homepage_content").select("content_type,value").eq("content_key", update.contentKey).maybeSingle();
      if (lookupError || !existing) return { success: false, message: "Content could not be loaded. No later fields were saved.", unsavedKeys };
      const localized = isTextContent(existing.content_type, existing.value);
      const column = locale === "de" && localized ? "value_de" : "value";
      const { data, error } = await supabase
        .from("homepage_content")
        .update({ [column]: column === "value_de" ? update.value || null : update.value, updated_at: new Date().toISOString() })
        .eq("content_key", update.contentKey)
        .select("id")
        .maybeSingle();

      if (error) return { success: false, message: "This field and subsequent fields could not be saved.", unsavedKeys };
      if (!data) {
        return { success: false, message: `Content row “${update.contentKey}” was not found.` };
      }
    }

    revalidatePath("/");
    revalidatePath("/admin/site-settings/homepage-content");
    return { success: true, message: `${section} content saved.` };
  } catch (error) {
    console.error("Homepage content save failed", { section, error });
    return {
      success: false,
      message: "Homepage content storage is not configured or could not be updated.",
    };
  }
}
