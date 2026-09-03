"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { X } from "lucide-react";
import AnnouncementLink from "@/components/announcements/AnnouncementLink";
import { useAnnouncementDismissal } from "@/components/announcements/useAnnouncementDismissal";
import type { Announcement } from "@/lib/announcements/types";

function TickerMessage({
  announcement,
  interactive = false,
  repeated = false,
}: {
  announcement: Announcement;
  interactive?: boolean;
  repeated?: boolean;
}) {
  return (
    <span
      className={`announcement-ticker-message inline-flex shrink-0 items-center gap-3 ${repeated ? "announcement-ticker-repeat" : ""
        }`}
      aria-hidden={repeated || !interactive ? true : undefined}
    >
      {/* Start dot */}
      <span aria-hidden="true" className="text-accent/55">
        •
      </span>

      <span>{announcement.message}</span>

      {announcement.cta_text && announcement.cta_url
        ? interactive
          ? (
            <AnnouncementLink
              href={announcement.cta_url}
              className="border-b border-accent/70 font-semibold text-accent transition-colors hover:text-accent-hover focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
            >
              {announcement.cta_text} →
            </AnnouncementLink>
          )
          : (
            <span className="border-b border-accent/70 font-semibold text-accent">
              {announcement.cta_text} →
            </span>
          )
        : null}

      {/* End dot */}
      <span aria-hidden="true" className="text-accent/55">
        •
      </span>
    </span>
  );
}

function TickerSegment({ announcement, primary = false, segmentRef }: { announcement: Announcement; primary?: boolean; segmentRef?: React.Ref<HTMLSpanElement> }) {
  return <span ref={segmentRef} className="announcement-ticker-segment flex shrink-0 items-center justify-around gap-0"><TickerMessage announcement={announcement} interactive={primary} /><TickerMessage announcement={announcement} repeated /><TickerMessage announcement={announcement} repeated /></span>;
}

export default function AnnouncementBar({ announcement }: { announcement: Announcement | null }) {
  const dismissal = useAnnouncementDismissal(announcement?.id ?? "", announcement?.is_dismissible ?? false);
  const [isClosing, setIsClosing] = useState(false);
  const [duration, setDuration] = useState(28);
  const viewportRef = useRef<HTMLDivElement>(null);
  const segmentRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    const segment = segmentRef.current;
    if (!viewport || !segment) return;
    const measure = () => {
      viewport.style.setProperty("--announcement-group-width", `${viewport.clientWidth}px`);
      setDuration(Math.max(20, segment.getBoundingClientRect().width / 36));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [announcement?.id]);

  if (!announcement || !dismissal.visible) return null;

  const tickerStyle = { "--announcement-duration": `${duration}s` } as CSSProperties;
  const dismiss = () => {
    setIsClosing(true);
    window.setTimeout(dismissal.dismiss, 180);
  };

  return <div className={`overflow-hidden border-y bg-[#15130f] text-foreground transition-[max-height,opacity,border-color] duration-200 ${isClosing ? "max-h-0 border-transparent opacity-0" : "max-h-14 border-border/70 opacity-100"}`}><div className="page-container grid min-h-10 grid-cols-[auto_minmax(0,1fr)_auto] items-center"><div className="flex h-5 shrink-0 items-center border-r border-border pr-3 sm:pr-4"><span className="hidden text-[9px] font-semibold uppercase tracking-[.22em] text-accent sm:inline">Announcement</span><span className="text-[9px] font-semibold uppercase tracking-[.2em] text-accent sm:hidden">Notice</span></div><div ref={viewportRef} className="announcement-ticker group min-w-0 overflow-hidden" style={tickerStyle}><div className="announcement-ticker-track flex w-max shrink-0 items-center whitespace-nowrap py-2.5 text-[10px] uppercase tracking-[.13em] text-foreground sm:text-xs"><TickerSegment announcement={announcement} primary segmentRef={segmentRef} /><TickerSegment announcement={announcement} /></div></div>{announcement.is_dismissible ? <button type="button" onClick={dismiss} aria-label="Dismiss announcement" className="ml-2 inline-flex size-9 shrink-0 items-center justify-center border-l border-border text-foreground-muted transition-colors hover:text-accent focus:outline-none focus-visible:text-accent sm:ml-3"><X size={14} /></button> : <span className="w-2" />}</div></div>;
}
