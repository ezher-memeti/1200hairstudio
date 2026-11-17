"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { useScrollVideoProgress } from "@/components/home/ScrollVideoSection";
import styles from "./google-reviews.module.css";

export default function GoogleReviewsReveal({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const progress = useScrollVideoProgress();
  // Section 2's last content group finishes revealing at progress 0.76.
  const close = Math.min(Math.max((progress - 0.5) / (0.76 - 0.5), 0), 1);

  useEffect(() => {
    const element = root.current;
    const inner = content.current;
    if (!element || !inner) return;
    let frame: number | null = null;
    const update = () => {
      frame = null;
      const rect = element.getBoundingClientRect();
      if (!rect.height) return;
      // Start closing before the strip leaves the screen, mirroring its entrance.
      const range = window.innerHeight * 0.3;
      const inset = window.innerHeight * 0.06;
      const enter = Math.min(Math.max((window.innerHeight - inset - rect.top) / range, 0), 1);
      const leave = Math.min(Math.max((rect.bottom - inset) / range, 0), 1);
      const visibility = Math.min(enter, leave);
      inner.style.setProperty("--reviews-reveal-opacity", String(visibility * visibility));
      inner.style.setProperty("--reviews-reveal-y", `${(leave - enter) * 48}px`);
    };
    const schedule = () => {
      if (frame === null) frame = requestAnimationFrame(update);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, []);

  return <div ref={root} data-reviews-reveal>
    <div ref={content} className={styles.revealContent} style={{
      "--reviews-section-two-opacity": 1 - close,
      "--reviews-section-two-y": `${-close * 48}px`,
    } as CSSProperties}>{children}</div>
  </div>;
}
