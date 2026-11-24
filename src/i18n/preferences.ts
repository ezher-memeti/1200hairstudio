"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isLocale, localeCookie, resolveLocale, type Locale } from "./config";

export async function getAccountLocale(): Promise<Locale | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const [{data: customer}, {data: profile}] = await Promise.all([
    admin.from("customers").select("preferred_locale").eq("profile_id", user.id).maybeSingle(),
    admin.from("profiles").select("preferred_locale").eq("id", user.id).maybeSingle(),
  ]);
  if (isLocale(customer?.preferred_locale)) return customer.preferred_locale;
  if (isLocale(profile?.preferred_locale)) return profile.preferred_locale;
  if (!customer && isLocale(user.user_metadata?.preferred_locale)) return user.user_metadata.preferred_locale;
  return null;
}

// Explicit switch only. Visiting another locale URL never writes account preferences.
// For linked customers, customers.preferred_locale is canonical; profiles is a mirror.
export async function saveLocalePreference(value: unknown) {
  if (!isLocale(value)) return { success: false };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const admin = createAdminClient();
    const { error } = await admin.from("customers").update({ preferred_locale: value }).eq("profile_id", user.id);
    if (error) return { success: false };
    const { error: profileError } = await admin.from("profiles").update({ preferred_locale: value }).eq("id", user.id);
    if (profileError) return { success: false };
    // Auth email templates read this locale; it is never used for authorization.
    const { error: metadataError } = await admin.auth.admin.updateUserById(user.id, { user_metadata: { preferred_locale: value } });
    if (metadataError) return { success: false };
  }
  (await cookies()).set(localeCookie, value, { path: "/", maxAge: 31536000, sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
  return { success: true };
}

export async function restoreAccountLocale() {
  const locale = await getAccountLocale();
  if (locale) (await cookies()).set(localeCookie, locale, { path: "/", maxAge: 31536000, sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
  return locale ?? resolveLocale((await cookies()).get(localeCookie)?.value);
}
