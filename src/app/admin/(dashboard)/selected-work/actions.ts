"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  acceptedSelectedWorkImageTypes,
  maxSelectedWorkImageBytes,
} from "@/config/selected-work-ui";
import { SELECTED_WORK_IMAGE_BUCKET } from "@/config/selected-work-storage";

const ACCEPTED_IMAGE_TYPES = new Set<string>(acceptedSelectedWorkImageTypes);

function sanitizeFileNameSegment(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function extractStoragePath(imageUrl: string | null | undefined) {
  if (!imageUrl) {
    return null;
  }

  try {
    const url = new URL(imageUrl);
    const marker = `/${SELECTED_WORK_IMAGE_BUCKET}/`;
    const markerIndex = url.pathname.indexOf(marker);

    if (markerIndex === -1) {
      return null;
    }

    return decodeURIComponent(
      url.pathname.slice(markerIndex + marker.length),
    );
  } catch {
    return null;
  }
}

function logAdminAuthDebug(
  stage: string,
  details: Record<string, unknown>,
) {
  console.error("[selected-work admin auth]", {
    stage,
    ...details,
  });
}

async function requireAdminClient() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    logAdminAuthDebug("auth.getUser.failed", {
      code: userError.code,
      message: userError.message,
      status: userError.status,
    });
    throw new Error("Unauthorized");
  }

  if (!user) {
    logAdminAuthDebug("auth.user.missing", {});
    throw new Error("Unauthorized");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();

  logAdminAuthDebug("profiles.lookup.result", {
    userId: user.id,
    profile,
    profileError: profileError
      ? {
          code: profileError.code,
          message: profileError.message,
          details: profileError.details,
          hint: profileError.hint,
        }
      : null,
  });

  if (profileError || !profile || profile.id !== user.id || profile.role !== "admin") {
    throw new Error("Unauthorized");
  }

  return supabase;
}

function toActionError(error: unknown) {
  if (error instanceof Error) {
    return { error: error.message };
  }

  return { error: "Unexpected server error." };
}

async function uploadSelectedWorkImage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  file: File,
  title: string,
) {
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
    throw new Error("Use a JPG, JPEG, PNG, or WebP image.");
  }

  if (file.size > maxSelectedWorkImageBytes) {
    throw new Error("Image must be 8 MB or smaller.");
  }

  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const filePath = `selected-work/${sanitizeFileNameSegment(title) || "selected-work"}-${crypto.randomUUID()}.${extension}`;
  const arrayBuffer = await file.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from(SELECTED_WORK_IMAGE_BUCKET)
    .upload(filePath, arrayBuffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const {
    data: { publicUrl },
  } = supabase.storage
    .from(SELECTED_WORK_IMAGE_BUCKET)
    .getPublicUrl(filePath);

  return { path: filePath, publicUrl };
}

async function removeStoredImage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  imageUrl: string | null | undefined,
) {
  const filePath = extractStoragePath(imageUrl);

  if (!filePath) {
    return;
  }

  await supabase.storage
    .from(SELECTED_WORK_IMAGE_BUCKET)
    .remove([filePath]);
}

export async function upsertSelectedWork(formData: FormData) {
  try {
    const supabase = await requireAdminClient();
    const id = (formData.get("id") ?? "").toString().trim() || undefined;
    const title = (formData.get("title") ?? "").toString().trim() || null;
    const description = (formData.get("description") ?? "").toString().trim() || null;
    const isActive = (formData.get("isActive") ?? "false") === "true";
    const currentImageUrl = (formData.get("currentImageUrl") ?? "")
      .toString()
      .trim();
    const imageFileEntry = formData.get("image");

    let imageUrl = currentImageUrl || null;

    if (!id && !(imageFileEntry instanceof File && imageFileEntry.size > 0)) {
      return { error: "Select an image for this work item." };
    }

    if (imageFileEntry instanceof File && imageFileEntry.size > 0) {
      const uploaded = await uploadSelectedWorkImage(
        supabase,
        imageFileEntry,
        title ?? "selected-work",
      );
      const {
        data: { publicUrl },
      } = supabase.storage
        .from(SELECTED_WORK_IMAGE_BUCKET)
        .getPublicUrl(uploaded.path);

      imageUrl = publicUrl;

      if (id && currentImageUrl && currentImageUrl !== imageUrl) {
        await removeStoredImage(supabase, currentImageUrl);
      }
    }

    if (!imageUrl) {
      return { error: "An image is required." };
    }

    if (id) {
      const { error } = await supabase
        .from("selected_work")
        .update({
          title,
          description,
          image_url: imageUrl,
          is_active: isActive,
        })
        .eq("id", id);

      if (error) {
        throw new Error(error.message);
      }
    } else {
      const { data: highestOrderItem } = await supabase
        .from("selected_work")
        .select("sort_order")
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextSortOrder = (highestOrderItem?.sort_order ?? 0) + 1;

      const { error } = await supabase.from("selected_work").insert({
        title,
        description,
        image_url: imageUrl,
        is_active: isActive,
        sort_order: nextSortOrder,
      });

      if (error) {
        throw new Error(error.message);
      }
    }

    revalidatePath("/");
    revalidatePath("/admin/selected-work");
    revalidatePath("/admin/site-settings/selected-work");

    return { success: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function toggleSelectedWorkVisibility(
  id: string,
  isActive: boolean,
) {
  try {
    const supabase = await requireAdminClient();
    const { error } = await supabase
      .from("selected_work")
      .update({ is_active: isActive })
      .eq("id", id);

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath("/");
    revalidatePath("/admin/selected-work");
    revalidatePath("/admin/site-settings/selected-work");
    return { success: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function removeSelectedWork(id: string) {
  try {
    const supabase = await requireAdminClient();
    const { data: existingItem, error: fetchError } = await supabase
      .from("selected_work")
      .select("image_url")
      .eq("id", id)
      .maybeSingle();

    if (fetchError) {
      throw new Error(fetchError.message);
    }

    const { error } = await supabase
      .from("selected_work")
      .delete()
      .eq("id", id);

    if (error) {
      throw new Error(error.message);
    }

    await removeStoredImage(supabase, existingItem?.image_url);

    revalidatePath("/");
    revalidatePath("/admin/selected-work");
    revalidatePath("/admin/site-settings/selected-work");
    return { success: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateSelectedWorkOrder(ids: string[]) {
  try {
    const supabase = await requireAdminClient();

    for (const [index, id] of ids.entries()) {
      const { error } = await supabase
        .from("selected_work")
        .update({ sort_order: index + 1 })
        .eq("id", id);

      if (error) {
        throw new Error(error.message);
      }
    }

    revalidatePath("/");
    revalidatePath("/admin/selected-work");
    revalidatePath("/admin/site-settings/selected-work");
    return { success: true };
  } catch (error) {
    return toActionError(error);
  }
}
