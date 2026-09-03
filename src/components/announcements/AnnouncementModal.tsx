"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, X } from "lucide-react";
import AnnouncementLink from "@/components/announcements/AnnouncementLink";
import { useAnnouncementDismissal } from "@/components/announcements/useAnnouncementDismissal";
import type { Announcement, AnnouncementRenderMode } from "@/lib/announcements/types";

const TRANSITION_MS = 220;

export default function AnnouncementModal({ announcement, mode = "public", onClose }: { announcement: Announcement | null; mode?: AnnouncementRenderMode; onClose?: () => void }) {
  const { visible, dismiss } = useAnnouncementDismissal(
    announcement?.id ?? "",
    announcement?.is_dismissible ?? false,
  );
  const [isOpen, setIsOpen] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<number>();

  useEffect(() => {
    if (!announcement || !visible) return;
    const frame = window.requestAnimationFrame(() => setIsOpen(true));
    if (mode === "public" && announcement.is_dismissible) closeButtonRef.current?.focus();
    if (mode === "preview") overlayRef.current?.focus({ preventScroll: true });
    return () => window.cancelAnimationFrame(frame);
  }, [announcement?.id, announcement, mode, visible]);

  useEffect(() => {
    if (mode !== "public" || !announcement || !visible || !announcement.is_dismissible) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  });

  useEffect(() => () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
  }, []);

  function closeModal(force = false) {
    if ((!announcement?.is_dismissible && !force) || closeTimerRef.current) return;
    setIsOpen(false);
    closeTimerRef.current = window.setTimeout(() => {
      dismiss();
      onClose?.();
    }, TRANSITION_MS);
  }

  if (!announcement || !visible) return null;

  const titleId = announcement.title ? `announcement-${announcement.id}` : undefined;
  const messageId = `announcement-message-${announcement.id}`;

  return (
    <div
      ref={overlayRef}
      tabIndex={mode === "preview" ? -1 : undefined}
      className={`fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/80 px-4 py-8 backdrop-blur-[3px] transition-opacity duration-200 sm:px-6 ${isOpen ? "opacity-100" : "opacity-0"}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={messageId}
      aria-label={titleId ? undefined : "Announcement"}
      onKeyDown={(event) => {
        if (mode === "preview" && event.key === "Escape") {
          event.stopPropagation();
          closeModal(true);
        }
      }}
      onMouseDown={(event) => {
        if (mode === "preview" && event.target === event.currentTarget) closeModal(true);
      }}
    >
      <article
        className={`relative my-auto w-full max-w-[34rem] overflow-hidden border border-white/[0.09] bg-[linear-gradient(145deg,#181714_0%,#11110f_72%)] shadow-[0_28px_90px_rgba(0,0,0,0.62)] transition-[opacity,transform] duration-200 ease-out ${isOpen ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-[0.985] opacity-0"}`}
      >
        <div className="h-px w-full bg-gradient-to-r from-transparent via-accent/65 to-transparent" />

        {announcement.is_dismissible ? (
          <button
            ref={closeButtonRef}
            type="button"
            onClick={() => closeModal()}
            aria-label="Dismiss announcement"
            className="absolute right-3 top-3 inline-flex size-10 items-center justify-center text-foreground-muted transition-colors hover:text-accent focus:outline-none focus-visible:ring-1 focus-visible:ring-accent sm:right-5 sm:top-5"
          >
            <X size={17} strokeWidth={1.5} />
          </button>
        ) : null}

        <div className="px-6 py-8 sm:px-10 sm:py-10 md:px-12 md:py-12">
          <p className="pr-10 font-primary text-[10px] font-medium uppercase tracking-[0.32em] text-accent">
            Announcement
          </p>
          <div className="mt-5 h-px w-10 bg-accent/55" />

          {announcement.title ? (
            <h2
              id={titleId}
              className="mt-7 break-words pr-4 font-display text-[clamp(2rem,7vw,3.25rem)] font-semibold uppercase leading-[0.94] tracking-[-0.035em] text-foreground"
            >
              {announcement.title}
            </h2>
          ) : null}

          <p
            id={messageId}
            className={`${announcement.title ? "mt-6" : "mt-7"} whitespace-pre-line break-words font-primary text-sm leading-7 text-foreground-secondary sm:text-[15px] sm:leading-8`}
          >
            {announcement.message}
          </p>

          {announcement.cta_text && announcement.cta_url ? (
            <AnnouncementLink
              href={announcement.cta_url}
              newTab={mode === "preview"}
              className="group mt-8 inline-flex min-h-11 max-w-full items-center gap-3 border-b border-accent/55 py-2 font-primary text-[10px] font-semibold uppercase tracking-[0.2em] text-accent transition-colors hover:border-accent hover:text-accent-hover focus:outline-none focus-visible:ring-1 focus-visible:ring-accent sm:mt-9 sm:text-xs"
            >
              <span className="break-words">{announcement.cta_text}</span>
              <ArrowRight size={15} className="shrink-0 transition-transform duration-200 group-hover:translate-x-1" />
            </AnnouncementLink>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-t border-white/[0.07] px-6 py-4 sm:px-10 md:px-12">
          <span className="font-display text-xs font-semibold uppercase tracking-[0.28em] text-foreground-muted">1200</span>
          <span className="font-primary text-[8px] uppercase tracking-[0.28em] text-foreground-muted/70">Hairstudio</span>
        </div>
      </article>
    </div>
  );
}
