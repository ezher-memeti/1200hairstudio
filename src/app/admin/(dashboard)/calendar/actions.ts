"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { AvailabilityExceptionRecord } from "@/lib/availability-exceptions/types";

type SaveAvailabilityExceptionInput = {
  date: string;
  mode: "normal" | "closed" | "custom";
  open_time: string | null;
  close_time: string | null;
  reason: string | null;
};

type CloseAvailabilityRangeInput = {
  start_date: string;
  end_date: string;
  reason: string | null;
};

function parseDateString(dateValue: string) {
  const [year, month, day] = dateValue.split("-").map(Number);

  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

  if (profileError || !profile || profile.role !== "admin") {
    throw new Error("Unauthorized");
  }

  return supabase;
}

function toActionError(error: unknown) {
  if (error instanceof Error) {
    return { error: error.message, exception: null as AvailabilityExceptionRecord | null };
  }

  return {
    error: "Unexpected server error.",
    exception: null as AvailabilityExceptionRecord | null,
  };
}

export async function saveAvailabilityException(
  input: SaveAvailabilityExceptionInput,
) {
  try {
    const supabase = await requireAdminClient();

    if (!input.date) {
      return { error: "Select a date first.", exception: null };
    }

    if (input.mode === "custom") {
      if (!input.open_time || !input.close_time) {
        return {
          error: "Set opening and closing times for custom hours.",
          exception: null,
        };
      }

      if (input.open_time >= input.close_time) {
        return {
          error: "Closing time must be later than opening time.",
          exception: null,
        };
      }
    }

    if (input.mode === "normal") {
      const { error } = await supabase
        .from("availability_exceptions")
        .delete()
        .eq("date", input.date);

      if (error) {
        return { error: error.message, exception: null };
      }

      revalidatePath("/admin/calendar");
      return { error: null, exception: null };
    }

    const values = {
      date: input.date,
      is_closed: input.mode === "closed",
      open_time: input.mode === "custom" ? input.open_time : null,
      close_time: input.mode === "custom" ? input.close_time : null,
      reason: input.reason?.trim() ? input.reason.trim() : null,
    };

    const { data, error } = await supabase
      .from("availability_exceptions")
      .upsert(values, {
        onConflict: "date",
      })
      .select("*")
      .single();

    if (error) {
      return { error: error.message, exception: null };
    }

    revalidatePath("/admin/calendar");
    return {
      error: null,
      exception: data as AvailabilityExceptionRecord,
    };
  } catch (error) {
    return toActionError(error);
  }
}

export async function closeAvailabilityDateRange(
  input: CloseAvailabilityRangeInput,
) {
  try {
    const supabase = await requireAdminClient();

    if (!input.start_date || !input.end_date) {
      return {
        error: "Select both a start date and an end date.",
        exceptions: [] as AvailabilityExceptionRecord[],
      };
    }

    const startDate = parseDateString(input.start_date);
    const endDate = parseDateString(input.end_date);

    if (!startDate || !endDate) {
      return {
        error: "Use valid calendar dates for the selected range.",
        exceptions: [] as AvailabilityExceptionRecord[],
      };
    }

    if (endDate < startDate) {
      return {
        error: "End date cannot be before start date.",
        exceptions: [] as AvailabilityExceptionRecord[],
      };
    }

    const values = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      values.push({
        date: toDateKey(currentDate),
        is_closed: true,
        open_time: null,
        close_time: null,
        reason: input.reason?.trim() ? input.reason.trim() : null,
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    const { data, error } = await supabase
      .from("availability_exceptions")
      .upsert(values, {
        onConflict: "date",
      })
      .select("*");

    if (error) {
      return {
        error: error.message,
        exceptions: [] as AvailabilityExceptionRecord[],
      };
    }

    revalidatePath("/admin/calendar");
    return {
      error: null,
      exceptions: (data ?? []) as AvailabilityExceptionRecord[],
    };
  } catch (error) {
    if (error instanceof Error) {
      return {
        error: error.message,
        exceptions: [] as AvailabilityExceptionRecord[],
      };
    }

    return {
      error: "Unexpected server error.",
      exceptions: [] as AvailabilityExceptionRecord[],
    };
  }
}
