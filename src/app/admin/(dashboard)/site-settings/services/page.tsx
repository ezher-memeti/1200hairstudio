import SiteSettingsServicesManager from "@/components/admin/SiteSettingsServicesManager";
import type { ServiceRecord } from "@/lib/services/types";
import { createClient } from "@/lib/supabase/server";

function isMissingServicesTableError(error: {
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
      .includes('relation "public.services" does not exist') ||
    error.message
      ?.toLowerCase()
      .includes('relation "services" does not exist')
  );
}

export default async function AdminSiteSettingsServicesPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("services")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  const loadError = error
    ? isMissingServicesTableError(error)
      ? "The services table is not available yet. Run the Supabase migration to enable service management."
      : `Services query failed: ${error.message}${error.code ? ` [${error.code}]` : ""}`
    : null;

  return (
    <SiteSettingsServicesManager
      initialServices={(data ?? []) as ServiceRecord[]}
      loadError={loadError}
    />
  );
}
