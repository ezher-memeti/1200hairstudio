"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type BusinessHourUpdate = {
  id: string;
  is_closed: boolean;
  open_time: string | null;
  close_time: string | null;
};

function logSettingsDebug(
  stage: string,
  details: Record<string, unknown>,
) {
  console.error("[settings business-hours]", {
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
    logSettingsDebug("auth.getUser.failed", {
      code: userError.code,
      message: userError.message,
      status: userError.status,
    });
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

  if (profileError || !profile || profile.role !== "admin") {
    logSettingsDebug("profiles.lookup.failed", {
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

export async function updateBusinessHours(
  updates: BusinessHourUpdate[],
) {
  try {
    const supabase = await requireAdminClient();

    for (const update of updates) {
      const values = {
        is_closed: update.is_closed,
        open_time: update.is_closed ? null : update.open_time,
        close_time: update.is_closed ? null : update.close_time,
      };

      const { error } = await supabase
        .from("business_hours")
        .update(values)
        .eq("id", update.id);

      if (error) {
        logSettingsDebug("business-hours.update.failed", {
          id: update.id,
          values,
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });
        return { error: error.message };
      }
    }

    revalidatePath("/admin/settings");
    revalidatePath("/admin/site-settings/business-hours");
    return { error: null };
  } catch (error) {
    return toActionError(error);
  }
}
