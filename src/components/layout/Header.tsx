import HeaderClient from "@/components/layout/HeaderClient";
import { createClient } from "@/lib/supabase/server";

async function getIsAdminUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return false;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  return profile?.role === "admin";
}

export default async function Header() {
  const isAdminUser = await getIsAdminUser();

  return <HeaderClient isAdminUser={isAdminUser} />;
}
