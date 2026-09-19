import "server-only";

import { cache } from "react";
import { requireAdminUser } from "@/lib/auth/customer";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_CONTACT_SECTION_SETTINGS, type ContactSectionSettings, type ContactSectionSettingsRow } from "@/lib/contact-section/types";

const columns = "id,is_enabled,eyebrow,title,description,address,map_url,phone_number,phone_display,instagram_enabled,instagram_username,instagram_url,google_reviews_enabled,google_reviews_url,google_leave_review_url,call_cta_label,instagram_cta_label,reviews_cta_label,leave_review_cta_label";

function text(value: string | null | undefined, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

export function normalizeContactSectionSettings(row: ContactSectionSettingsRow | null): ContactSectionSettings {
  if (!row) return DEFAULT_CONTACT_SECTION_SETTINGS;
  return {
    id: row.id,
    isEnabled: row.is_enabled ?? true,
    eyebrow: text(row.eyebrow),
    title: text(row.title),
    description: text(row.description),
    address: text(row.address),
    mapUrl: text(row.map_url),
    phoneNumber: text(row.phone_number),
    phoneDisplay: text(row.phone_display),
    instagramEnabled: row.instagram_enabled ?? false,
    instagramUsername: text(row.instagram_username),
    instagramUrl: text(row.instagram_url),
    googleReviewsEnabled: row.google_reviews_enabled ?? false,
    googleReviewsUrl: text(row.google_reviews_url),
    googleLeaveReviewUrl: text(row.google_leave_review_url),
    callCtaLabel: text(row.call_cta_label),
    instagramCtaLabel: text(row.instagram_cta_label),
    reviewsCtaLabel: text(row.reviews_cta_label),
    leaveReviewCtaLabel: text(row.leave_review_cta_label),
  };
}

export const getPublicContactSectionSettings = cache(async (): Promise<ContactSectionSettings | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("contact_section_settings").select(columns).order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (error) {
    console.error("PUBLIC CONTACT SETTINGS QUERY ERROR", error);
    return null;
  }
  return data ? normalizeContactSectionSettings(data as ContactSectionSettingsRow) : null;
});

export async function getAdminContactSectionSettings(): Promise<ContactSectionSettings> {
  const { supabase } = await requireAdminUser();
  const { data, error } = await supabase.from("contact_section_settings").select(columns).order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (error) {
    console.error("ADMIN CONTACT SETTINGS QUERY ERROR", error);
    throw new Error("Unable to load contact settings.");
  }
  if (!data) {
    const { id: _defaultId, ...defaults } = DEFAULT_CONTACT_SECTION_SETTINGS;
    const id = await persistContactSectionSettings(defaults);
    return { ...DEFAULT_CONTACT_SECTION_SETTINGS, id };
  }
  return normalizeContactSectionSettings(data as ContactSectionSettingsRow);
}

export async function persistContactSectionSettings(settings: Omit<ContactSectionSettings, "id">) {
  const { supabase } = await requireAdminUser();
  const { data: existing, error: loadError } = await supabase.from("contact_section_settings").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (loadError) throw loadError;
  const payload = {
    is_enabled: settings.isEnabled,
    eyebrow: settings.eyebrow || null,
    title: settings.title || null,
    description: settings.description || null,
    address: settings.address || null,
    map_url: settings.mapUrl || null,
    phone_number: settings.phoneNumber || null,
    phone_display: settings.phoneDisplay || null,
    instagram_enabled: settings.instagramEnabled,
    instagram_username: settings.instagramUsername || null,
    instagram_url: settings.instagramUrl || null,
    google_reviews_enabled: settings.googleReviewsEnabled,
    google_reviews_url: settings.googleReviewsUrl || null,
    google_leave_review_url: settings.googleLeaveReviewUrl || null,
    call_cta_label: settings.callCtaLabel || null,
    instagram_cta_label: settings.instagramCtaLabel || null,
    reviews_cta_label: settings.reviewsCtaLabel || null,
    leave_review_cta_label: settings.leaveReviewCtaLabel || null,
    updated_at: new Date().toISOString(),
  };
  const query = existing?.id
    ? supabase.from("contact_section_settings").update(payload).eq("id", existing.id).select("id").single()
    : supabase.from("contact_section_settings").insert(payload).select("id").single();
  const { data, error } = await query;
  if (error || !data) {
    console.error("CONTACT SETTINGS SAVE ERROR", { operation: existing?.id ? "update" : "insert", error });
    throw new Error("Unable to save contact settings.");
  }
  return data.id as string;
}
