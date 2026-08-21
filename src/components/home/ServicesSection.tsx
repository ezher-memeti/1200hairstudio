import Services from "@/components/home/Services";
import type { ServiceRecord } from "@/lib/services/types";
import { createClient } from "@/lib/supabase/server";

async function getActiveServices() {
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

export default async function ServicesSection() {
  const services = await getActiveServices();

  return <Services services={services} />;
}
