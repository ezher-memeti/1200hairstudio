"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const SERVICE_IMAGE_BUCKET = "service-images";
const ACCEPTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

function toNumber(value: FormDataEntryValue | null) {
  return Number((value ?? "").toString().trim());
}

function toNullableNumber(value: FormDataEntryValue | null) {
  const normalized = (value ?? "").toString().trim();
  return normalized ? Number(normalized) : null;
}

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
    const marker = `/${SERVICE_IMAGE_BUCKET}/`;
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


async function requireAdminClient() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw new Error("Unauthorized");
  }

  if (!user) {
    throw new Error("Unauthorized");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error("Unauthorized");
  }

  if (!profile) {
    throw new Error("Unauthorized");
  }

  if (profile.id !== user.id) {
    throw new Error("Unauthorized");
  }

  if (profile.role !== "admin") {
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

async function uploadServiceImage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  file: File,
  serviceName: string,
) {
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
    throw new Error("Use a JPG, JPEG, PNG, or WebP image.");
  }

  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const filePath = `services/${sanitizeFileNameSegment(serviceName) || "service"}-${crypto.randomUUID()}.${extension}`;
  const arrayBuffer = await file.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from(SERVICE_IMAGE_BUCKET)
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
    .from(SERVICE_IMAGE_BUCKET)
    .getPublicUrl(filePath);

  return {
    filePath,
    publicUrl,
  };
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
    .from(SERVICE_IMAGE_BUCKET)
    .remove([filePath]);
}

export async function upsertService(formData: FormData) {
  try {
    const supabase = await requireAdminClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    const id = (formData.get("id") ?? "").toString().trim() || undefined;
    const name = (formData.get("name") ?? "").toString().trim();
    const description = (formData.get("description") ?? "")
      .toString()
      .trim();
    const price = toNumber(formData.get("price"));
    const durationMin = toNumber(formData.get("durationMin"));
    const durationMax = toNullableNumber(
      formData.get("durationMax"),
    );
    const submittedSortOrder = toNullableNumber(
      formData.get("sortOrder"),
    );
    const isActive = (formData.get("isActive") ?? "false") === "true";
    const currentImageUrl = (formData.get("currentImageUrl") ?? "")
      .toString()
      .trim();
    const imageFileEntry = formData.get("image");

    if (!name) {
      return { error: "Service name is required." };
    }

    if (!Number.isFinite(price) || price < 0) {
      return { error: "Enter a valid service price." };
    }

    if (!Number.isFinite(durationMin) || durationMin <= 0) {
      return { error: "Enter a valid minimum duration." };
    }

    if (
      durationMax !== null &&
      (!Number.isFinite(durationMax) ||
        durationMax < durationMin)
    ) {
      return {
        error:
          "Maximum duration must be empty or greater than the minimum duration.",
      };
    }

    let nextImageUrl = currentImageUrl || null;
    let previousImageUrl: string | null = null;
    let sortOrder = submittedSortOrder;

    if (id) {
      const { data: existingService, error: existingServiceError } =
        await supabase
          .from("services")
          .select("image_url, sort_order")
          .eq("id", id)
          .single();

      if (existingServiceError) {
        return { error: existingServiceError.message };
      }

      previousImageUrl = existingService.image_url;
      nextImageUrl = existingService.image_url;
      sortOrder =
        submittedSortOrder ?? existingService.sort_order;
    } else if (sortOrder === null) {
      const { data: lastService, error: lastServiceError } =
        await supabase
          .from("services")
          .select("sort_order")
          .order("sort_order", { ascending: false })
          .limit(1)
          .maybeSingle();

      if (lastServiceError) {
        return { error: lastServiceError.message };
      }

      sortOrder = (lastService?.sort_order ?? 0) + 1;
    }

    if (!Number.isFinite(sortOrder)) {
      return { error: "Unable to determine service sort order." };
    }

    if (imageFileEntry instanceof File && imageFileEntry.size > 0) {
      try {
        const { publicUrl } = await uploadServiceImage(
          supabase,
          imageFileEntry,
          name,
        );
        nextImageUrl = publicUrl;
      } catch (error) {
        return {
          error:
            error instanceof Error
              ? error.message
              : "Image upload failed.",
        };
      }
    }

    const values = {
      name,
      description: description || null,
      price,
      duration_min: durationMin,
      duration_max: durationMax,
      image_url: nextImageUrl,
      is_active: isActive,
      sort_order: sortOrder,
    };

    const query = id
      ? supabase
          .from("services")
          .update(values)
          .eq("id", id)
      : supabase.from("services").insert(values);

    const { error } = await query;

    if (error) {
      return { error: error.message };
    }

    if (
      nextImageUrl &&
      previousImageUrl &&
      nextImageUrl !== previousImageUrl
    ) {
      await removeStoredImage(supabase, previousImageUrl);
    }

    revalidatePath("/");
    revalidatePath("/admin/services");
    revalidatePath("/admin/site-settings/services");
    return { error: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function toggleServiceVisibility(
  id: string,
  isActive: boolean,
) {
  try {
    const supabase = await requireAdminClient();
    const { error } = await supabase
      .from("services")
      .update({ is_active: isActive })
      .eq("id", id);

    if (error) {
      return { error: error.message };
    }

    revalidatePath("/");
    revalidatePath("/admin/services");
    revalidatePath("/admin/site-settings/services");
    return { error: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateServiceOrder(
  serviceIdsInOrder: string[],
) {
  try {
    const supabase = await requireAdminClient();

    for (const [index, serviceId] of serviceIdsInOrder.entries()) {
      const { error } = await supabase
        .from("services")
        .update({ sort_order: index + 1 })
        .eq("id", serviceId);

      if (error) {
        return { error: error.message };
      }
    }

    revalidatePath("/");
    revalidatePath("/admin/services");
    revalidatePath("/admin/site-settings/services");
    return { error: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function removeService(id: string) {
  try {
    const supabase = await requireAdminClient();
    const { data: service, error: serviceError } = await supabase
      .from("services")
      .select("image_url")
      .eq("id", id)
      .single();

    if (serviceError) {
      return { error: serviceError.message };
    }

    const { error } = await supabase
      .from("services")
      .delete()
      .eq("id", id);

    if (error) {
      return { error: error.message };
    }

    await removeStoredImage(supabase, service.image_url);

    revalidatePath("/");
    revalidatePath("/admin/services");
    revalidatePath("/admin/site-settings/services");
    return { error: null };
  } catch (error) {
    return toActionError(error);
  }
}
