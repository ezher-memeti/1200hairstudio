"use server";

import { revalidatePath } from "next/cache";
import { requireAdminUser } from "@/lib/auth/customer";
import { getUtcIsoForZurichDateTime } from "@/lib/appointments/availability";
import { ANNOUNCEMENT_DISPLAY_TYPES, type AnnouncementInput } from "@/lib/announcements/types";

type Result = { success: boolean; message: string };

function toInstant(value: string) {
  if (!value) return null;
  const [dateKey, time] = value.split("T");
  if (!dateKey || !time) throw new Error("Enter a valid date and time.");
  const instant = new Date(getUtcIsoForZurichDateTime(dateKey, time));
  if (Number.isNaN(instant.getTime())) throw new Error("Enter a valid date and time.");
  return instant;
}

function validate(input: AnnouncementInput) {
  const message = input.message.trim();
  const priority = Number(input.priority);
  if (!message) throw new Error("Announcement message is required.");
  if (!ANNOUNCEMENT_DISPLAY_TYPES.includes(input.displayType)) throw new Error("Select a valid display type.");
  if (!Number.isInteger(priority)) throw new Error("Priority must be a whole number.");
  const startsAt = toInstant(input.startsAt);
  const expiresAt = toInstant(input.expiresAt);
  if (startsAt && expiresAt && expiresAt <= startsAt) throw new Error("Expiry must be after the start date.");
  const ctaUrl = input.ctaUrl.trim();
  if (ctaUrl && !/^(https?:\/\/|\/|#)/i.test(ctaUrl)) throw new Error("CTA URL must be an internal path or an HTTP(S) URL.");
  return {
    title: input.title.trim() || null,
    message,
    display_type: input.displayType,
    cta_text: input.ctaText.trim() || null,
    cta_url: ctaUrl || null,
    starts_at: startsAt?.toISOString() ?? null,
    expires_at: expiresAt?.toISOString() ?? null,
    is_active: Boolean(input.isActive),
    is_dismissible: Boolean(input.isDismissible),
    priority,
  };
}

function revalidateAnnouncements() {
  revalidatePath("/");
  revalidatePath("/admin/site-settings/announcements");
}

export async function saveAnnouncement(input: AnnouncementInput, announcementId?: string): Promise<Result> {
  try {
    const { supabase } = await requireAdminUser();
    const payload = validate(input);
    const query = announcementId
      ? supabase.from("announcements").update(payload).eq("id", announcementId).select("id").maybeSingle()
      : supabase.from("announcements").insert(payload).select("id").single();
    const { data, error } = await query;
    if (error) throw error;
    if (!data) return { success: false, message: "Announcement was not found or could not be updated." };
    revalidateAnnouncements();
    return { success: true, message: announcementId ? "Announcement updated." : "Announcement created." };
  } catch (error) {
    console.error("Announcement save failed", { operation: announcementId ? "update" : "create", announcementId, error });
    return { success: false, message: error instanceof Error && !/row-level|permission|postgres/i.test(error.message) ? error.message : "Unable to save this announcement." };
  }
}

export async function deleteAnnouncement(announcementId: string): Promise<Result> {
  try {
    const { supabase } = await requireAdminUser();
    const { error } = await supabase.from("announcements").delete().eq("id", announcementId);
    if (error) throw error;
    revalidateAnnouncements();
    return { success: true, message: "Announcement deleted." };
  } catch (error) {
    console.error("Announcement delete failed", { announcementId, error });
    return { success: false, message: "Unable to delete this announcement." };
  }
}

export async function setAnnouncementActive(announcementId: string, isActive: boolean): Promise<Result> {
  try {
    const { supabase } = await requireAdminUser();
    const { data, error } = await supabase.from("announcements").update({ is_active: isActive }).eq("id", announcementId).select("id").maybeSingle();
    if (error) throw error;
    if (!data) return { success: false, message: "Announcement was not found." };
    revalidateAnnouncements();
    return { success: true, message: isActive ? "Announcement enabled." : "Announcement disabled." };
  } catch (error) {
    console.error("Announcement status update failed", { announcementId, error });
    return { success: false, message: "Unable to update announcement status." };
  }
}
