"use client";

import { X } from "lucide-react";
import AnnouncementLink from "@/components/announcements/AnnouncementLink";
import { useAnnouncementDismissal } from "@/components/announcements/useAnnouncementDismissal";
import type { Announcement, AnnouncementRenderMode } from "@/lib/announcements/types";

export default function BookingAnnouncement({ announcement, mode = "public" }: { announcement: Announcement | null; mode?: AnnouncementRenderMode }) {
  const dismissal = useAnnouncementDismissal(announcement?.id ?? "", announcement?.is_dismissible ?? false);
  if (!announcement || !dismissal.visible) return null;
  return <div className="bg-background px-5 pt-8 sm:px-6"><div className={`${mode === "preview" ? "w-full" : "page-container"} relative border-l-2 border-accent bg-surface px-5 py-4 sm:flex sm:items-center sm:justify-between sm:gap-5`}><div><p className="text-[9px] uppercase tracking-[.2em] text-accent">Booking Notice</p>{announcement.title ? <p className="mt-2 font-display text-xl text-foreground">{announcement.title}</p> : null}<p className="mt-1 break-words pr-8 text-sm leading-6 text-foreground-secondary">{announcement.message}</p></div>{announcement.cta_text && announcement.cta_url ? <AnnouncementLink href={announcement.cta_url} newTab={mode === "preview"} className="mt-4 inline-flex shrink-0 text-[10px] font-semibold uppercase tracking-[.16em] text-accent hover:text-accent-hover sm:mt-0">{announcement.cta_text} →</AnnouncementLink> : null}{announcement.is_dismissible ? <button type="button" onClick={dismissal.dismiss} aria-label={mode === "preview" ? "Dismiss announcement preview" : "Dismiss announcement"} className="absolute right-2 top-2 inline-flex size-9 items-center justify-center text-foreground-muted hover:text-accent"><X size={14} /></button> : null}</div></div>;
}
