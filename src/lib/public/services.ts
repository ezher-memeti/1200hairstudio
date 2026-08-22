import { createClient } from "@/lib/supabase/server";
import type { ServiceRecord } from "@/lib/services/types";

export async function getActiveServices() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("services")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    return [] as ServiceRecord[];
  }

  return (data ?? []) as ServiceRecord[];
}

export function formatServiceDuration(service: Pick<ServiceRecord, "duration_min" | "duration_max">) {
  const min = service.duration_min;
  const max = service.duration_max ?? min;

  return min === max ? `${min} MIN` : `${min}–${max} MIN`;
}

export function formatServicePrice(price: number) {
  return `CHF ${price.toFixed(0)}`;
}
