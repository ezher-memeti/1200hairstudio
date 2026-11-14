"use server";

import { revalidatePath } from "next/cache";
import { persistContactSectionSettings } from "@/lib/contact-section/settings";
import type { ContactSectionSettings } from "@/lib/contact-section/types";

type Result = { success: boolean; message: string };

function clean(value: string, max: number) {
  return value.trim().slice(0, max);
}

function optionalUrl(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) return "";
  try {
    const url = new URL(normalized);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
    return url.toString();
  } catch {
    throw new Error(`${label} must be a valid HTTP(S) URL.`);
  }
}

export async function saveContactSectionSettings(input: ContactSectionSettings): Promise<Result> {
  try {
    const phoneNumber = clean(input.phoneNumber, 40);
    if (phoneNumber && (!/[0-9]/.test(phoneNumber) || !/^[+\d\s().-]+$/.test(phoneNumber))) throw new Error("Enter a valid phone number.");
    const settings = {
      isEnabled: input.isEnabled === true,
      eyebrow: clean(input.eyebrow, 80),
      title: clean(input.title, 180),
      description: clean(input.description, 800),
      address: clean(input.address, 300),
      mapUrl: optionalUrl(input.mapUrl, "Map URL"),
      phoneNumber,
      phoneDisplay: clean(input.phoneDisplay, 60),
      instagramEnabled: input.instagramEnabled === true,
      instagramUsername: clean(input.instagramUsername, 80),
      instagramUrl: optionalUrl(input.instagramUrl, "Instagram URL"),
      googleReviewsEnabled: input.googleReviewsEnabled === true,
      googleLeaveReviewUrl: optionalUrl(input.googleLeaveReviewUrl, "Leave-review URL"),
      callCtaLabel: clean(input.callCtaLabel, 80),
      instagramCtaLabel: clean(input.instagramCtaLabel, 80),
      leaveReviewCtaLabel: clean(input.leaveReviewCtaLabel, 80),
    };
    if (settings.instagramEnabled && !settings.instagramUrl) throw new Error("Instagram URL is required when Instagram is enabled.");
    if (settings.instagramEnabled && !settings.instagramCtaLabel) throw new Error("Instagram CTA label is required when Instagram is enabled.");
    if (settings.googleReviewsEnabled && !settings.googleLeaveReviewUrl) throw new Error("Leave-review URL is required when Leave a Review is enabled.");
    if (settings.googleReviewsEnabled && !settings.leaveReviewCtaLabel) throw new Error("Leave Review CTA label is required when Leave a Review is enabled.");
    await persistContactSectionSettings(settings);
    revalidatePath("/");
    revalidatePath("/admin/site-settings/contact");
    return { success: true, message: "Contact section settings saved." };
  } catch (error) {
    console.error("CONTACT SETTINGS ACTION ERROR", error);
    return { success: false, message: error instanceof Error && !/row-level|permission|postgres/i.test(error.message) ? error.message : "Unable to save contact settings." };
  }
}
