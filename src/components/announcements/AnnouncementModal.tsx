"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import AnnouncementLink from "@/components/announcements/AnnouncementLink";
import { useAnnouncementDismissal } from "@/components/announcements/useAnnouncementDismissal";
import type { Announcement } from "@/lib/announcements/types";

export default function AnnouncementModal({ announcement }: { announcement: Announcement | null }) {
  const dismissal = useAnnouncementDismissal(announcement?.id ?? "", announcement?.is_dismissible ?? false);
  useEffect(() => {
    if (!announcement || !dismissal.visible || !announcement.is_dismissible) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") dismissal.dismiss(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [announcement, dismissal]);
  if (!announcement || !dismissal.visible) return null;
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-labelledby={announcement.title ? `announcement-${announcement.id}` : undefined}><div className="relative w-full max-w-lg border border-border bg-surface p-7 shadow-2xl sm:p-10">{announcement.is_dismissible ? <button type="button" onClick={dismissal.dismiss} aria-label="Dismiss announcement" className="absolute right-3 top-3 inline-flex size-10 items-center justify-center text-foreground-muted hover:text-accent"><X size={18} /></button> : null}<p className="text-[10px] uppercase tracking-[.24em] text-accent">1200 Hairstudio</p>{announcement.title ? <h2 id={`announcement-${announcement.id}`} className="mt-4 pr-8 font-display text-3xl font-semibold uppercase leading-tight text-foreground">{announcement.title}</h2> : null}<p className="mt-5 text-sm leading-7 text-foreground-secondary sm:text-base">{announcement.message}</p>{announcement.cta_text && announcement.cta_url ? <AnnouncementLink href={announcement.cta_url} className="mt-7 inline-flex min-h-12 items-center bg-accent px-6 text-xs font-semibold uppercase tracking-[.16em] text-background hover:bg-accent-hover">{announcement.cta_text}</AnnouncementLink> : null}</div></div>;
}
