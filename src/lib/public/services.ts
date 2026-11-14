import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/public";
import type { ServiceRecord } from "@/lib/services/types";

export const getActiveServices = cache(async () => {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("services")
    .select("id,name,price,duration_min,duration_max,image_url,is_active,sort_order,created_at,updated_at")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    return [] as ServiceRecord[];
  }

  return (data ?? []) as ServiceRecord[];
});

export function formatServiceDuration(service: Pick<ServiceRecord, "duration_min" | "duration_max">) {
  const min = service.duration_min;
  const max = service.duration_max ?? min;

  return min === max ? `${min} MIN` : `${min}–${max} MIN`;
}

export function formatServicePrice(price: number) {
  return `CHF ${price.toFixed(0)}`;
}
