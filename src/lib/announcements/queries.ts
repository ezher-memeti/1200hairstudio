import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Announcement, AnnouncementDisplayType } from "@/lib/announcements/types";

export const getActiveAnnouncements = cache(async (): Promise<Announcement[]> => {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("announcements")
    .select("*")
    .eq("is_active", true)
    .or(`starts_at.is.null,starts_at.lte.${now}`)
    .or(`expires_at.is.null,expires_at.gte.${now}`)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Unable to load public announcements", error);
    return [];
  }
  return (data ?? []) as Announcement[];
});

export function selectAnnouncement(announcements: Announcement[], displayType: AnnouncementDisplayType) {
  return announcements.find((announcement) => announcement.display_type === displayType) ?? null;
}

export async function getAdminAnnouncements(): Promise<Announcement[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("announcements")
    .select("*")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Announcement[];
}
