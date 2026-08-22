import BusinessHoursManager from "@/components/admin/BusinessHoursManager";
import type { BusinessHourRecord } from "@/lib/business-hours/types";
import { createClient } from "@/lib/supabase/server";

function isMissingBusinessHoursTableError(error: {
  code?: string;
  message?: string;
} | null) {
  if (!error) {
    return false;
  }

  return (
    error.code === "42P01" ||
    error.message
      ?.toLowerCase()
      .includes('relation "public.business_hours" does not exist') ||
    error.message
      ?.toLowerCase()
      .includes('relation "business_hours" does not exist')
  );
}

export default async function AdminSettingsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_hours")
    .select("*")
    .order("day_of_week", { ascending: true });

  console.log("[admin/settings] business-hours.query.data", {
    rows: data ?? null,
  });

  if (error) {
    console.error("[admin/settings] business-hours.query.error", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
  }

  const loadError = error
    ? isMissingBusinessHoursTableError(error)
      ? "The business_hours table is not available yet."
      : `Business hours query failed: ${error.message}${error.code ? ` [${error.code}]` : ""}`
    : null;

  return (
    <BusinessHoursManager
      initialHours={(data ?? []) as BusinessHourRecord[]}
      loadError={loadError}
    />
  );
}
