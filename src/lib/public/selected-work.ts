import { createClient } from "@/lib/supabase/server";
import type { SelectedWorkRecord } from "@/lib/selected-work/types";

export async function getActiveSelectedWork() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("selected_work")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    return [] as SelectedWorkRecord[];
  }

  return (data ?? []) as SelectedWorkRecord[];
}
