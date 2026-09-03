"use server";

import { revalidatePath } from "next/cache";
import { requireAdminUser } from "@/lib/auth/customer";
import {
  homepageContentDefinitions,
  type HomepageContentKey,
  type HomepageContentSection,
} from "@/lib/homepage-content-defaults";

type HomepageContentUpdate = { contentKey: HomepageContentKey; value: string };
type SaveResult = { success: boolean; message: string };

export async function saveHomepageContentSection(
  section: HomepageContentSection,
  updates: HomepageContentUpdate[],
): Promise<SaveResult> {
  try {
    const { supabase } = await requireAdminUser();
    const allowedKeys = new Set(
      homepageContentDefinitions
        .filter((field) => field.section === section)
        .map((field) => field.contentKey),
    );

    if (!allowedKeys.size || updates.length !== allowedKeys.size) {
      return { success: false, message: "The submitted homepage section is incomplete." };
    }

    const normalized = updates.map((update) => ({
      contentKey: update.contentKey,
      value: update.value.trim(),
    }));

    if (normalized.some((update) => !allowedKeys.has(update.contentKey) || !update.value)) {
      return { success: false, message: "All homepage content fields in this section are required." };
    }

    for (const update of normalized) {
      const { data, error } = await supabase
        .from("homepage_content")
        .update({ value: update.value, updated_at: new Date().toISOString() })
        .eq("content_key", update.contentKey)
        .select("id")
        .maybeSingle();

      if (error) throw error;
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
