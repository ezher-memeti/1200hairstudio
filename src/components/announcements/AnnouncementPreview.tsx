"use client";

import { useRef, useState } from "react";
import { Eye } from "lucide-react";
import AnnouncementBar from "@/components/announcements/AnnouncementBar";
import AnnouncementModal from "@/components/announcements/AnnouncementModal";
import BookingAnnouncement from "@/components/announcements/BookingAnnouncement";
import type { Announcement } from "@/lib/announcements/types";

export default function AnnouncementPreview({ announcement }: { announcement: Announcement }) {
  const [modalPreviewKey, setModalPreviewKey] = useState<number | null>(null);
  const modalTriggerRef = useRef<HTMLButtonElement>(null);

  if (announcement.display_type === "top_bar") {
    return <AnnouncementBar key={announcement.id} announcement={announcement} mode="preview" />;
  }

  if (announcement.display_type === "booking_notice") {
    return <BookingAnnouncement key={announcement.id} announcement={announcement} mode="preview" />;
  }

  return (
    <div className="flex min-h-28 items-center justify-center bg-background p-5">
      <button
        ref={modalTriggerRef}
        type="button"
        onClick={() => setModalPreviewKey(Date.now())}
        className="inline-flex min-h-11 items-center gap-2 border border-border px-5 text-[10px] font-semibold uppercase tracking-[.16em] text-foreground transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:border-accent"
      >
        <Eye size={14} /> Preview Modal
      </button>
      {modalPreviewKey !== null ? (
        <AnnouncementModal
          key={modalPreviewKey}
          announcement={announcement}
          mode="preview"
          onClose={() => {
            setModalPreviewKey(null);
            window.requestAnimationFrame(() => modalTriggerRef.current?.focus());
          }}
        />
      ) : null}
    </div>
  );
}
