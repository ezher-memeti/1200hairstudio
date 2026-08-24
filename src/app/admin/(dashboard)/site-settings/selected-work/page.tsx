import SelectedWorkManager from "@/components/admin/SelectedWorkManager";
import type { SelectedWorkRecord } from "@/lib/selected-work/types";
import { createClient } from "@/lib/supabase/server";

function isMissingSelectedWorkTableError(error: {
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
      .includes('relation "public.selected_work" does not exist') ||
    error.message
      ?.toLowerCase()
      .includes('relation "selected_work" does not exist')
  );
}

export default async function AdminSiteSettingsSelectedWorkPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("selected_work")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  const loadError = error
    ? isMissingSelectedWorkTableError(error)
      ? "The selected_work table is not available yet. Enable it in Supabase before managing the gallery."
      : `Selected work query failed: ${error.message}${error.code ? ` [${error.code}]` : ""}`
    : null;

  return (
    <SelectedWorkManager
      initialItems={(data ?? []) as SelectedWorkRecord[]}
      loadError={loadError}
    />
  );
}
