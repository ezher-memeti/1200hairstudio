"use client";

import Image from "next/image";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { GoogleReview, GoogleReviews } from "@/lib/google-reviews/types";
import styles from "./google-reviews.module.css";

const SPEED = 24; // CSS pixels/second, independent of review count and breakpoints.
function Stars({ rating }: { rating: number }) {
  return <span className={styles.stars} role="img" aria-label={`${rating} out of 5 stars`}>
    <span aria-hidden="true">★★★★★</span>
    <span aria-hidden="true" className={styles.starFill} style={{ width: `${rating / 5 * 100}%` }}>★★★★★</span>
  </span>;
}
function Review({ review, duplicate }: { review: GoogleReview; duplicate: boolean }) {
  const tabIndex = duplicate ? -1 : undefined;
  const initials = review.author.trim().split(/\s+/u).slice(0, 2).map((part) => Array.from(part)[0]).join("").toUpperCase();
  const author = <>
    <span className={styles.avatar} aria-hidden="true">
      <span>{initials}</span>
      {review.avatarUri && <Image src={review.avatarUri} alt="" width={28} height={28} unoptimized loading="lazy" referrerPolicy="no-referrer"
        onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} />}
    </span>
    <span className={styles.authorName} dir="auto">{review.author}</span>
  </>;
  return <article className={styles.review} aria-hidden={duplicate || undefined}>
    <div className={styles.card}>
    <div className={styles.reviewHeader}>
      {review.authorUri
        ? <a href={review.authorUri} tabIndex={tabIndex} target="_blank" rel="noopener noreferrer" className={styles.author} aria-label={`${review.author}, Google Maps profile (opens in a new tab)`}>{author}</a>
        : <div className={styles.author}>{author}</div>}
      <Stars rating={review.rating} />
    </div>
    <p className={styles.quote} dir="auto" lang={review.language ?? undefined}>
      <a href={review.uri} target="_blank" rel="noopener noreferrer" tabIndex={tabIndex}>
        {review.text || "View rating on Google Maps"}
        <span className="sr-only"> — Open the complete original review on Google Maps (opens in a new tab).</span>
      </a>
    </p>
    </div>
  </article>;
}

export default function GoogleReviewsClient({ data }: { data: GoogleReviews }) {
  // Four source sequences fill the 3-card viewport before hydration, even with one review.
  const initialCopies = 4;
  const [copies, setCopies] = useState(initialCopies);
  const [browsing, setBrowsing] = useState<"keyboard" | "touch" | null>(null);
  const [touching, setTouching] = useState(false);
  // Release/focus events can precede a React commit; timers read this synchronous mode.
  const browsingMode = useRef<"keyboard" | "touch" | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const segment = useRef<HTMLDivElement>(null);
  const distanceRef = useRef(0);
  const pointerFocus = useRef(false);
  const touchStart = useRef<number | null>(null);
  const touchHeld = useRef(false);
  const pendingOffset = useRef<number | null>(null);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Same measured CSS ticker as AnnouncementBar, with a source-sequence distance. No
  // animation-frame React state. Only viewport/item geometry changes timing.
  useLayoutEffect(() => {
    const view = viewport.current, group = segment.current;
    const item = group?.querySelector("article");
    if (!view || !group || !item || !data.reviews.length) return;
    const measure = () => {
      const css = getComputedStyle(view);
      const columns = Number(css.getPropertyValue("--reviews-per-view"));
      const gap = parseFloat(css.getPropertyValue("--review-gap"));
      // Whole-pixel strides avoid subpixel rasterization changes at the seam.
      const stride = Math.floor((view.clientWidth - (columns - 1) * gap) / columns + gap);
      if (!stride) return;
      const slot = `${stride}px`;
      if (view.style.getPropertyValue("--review-slot-width") !== slot) view.style.setProperty("--review-slot-width", slot);
      const distance = group.getBoundingClientRect().width; // Complete source sequence, including every gap.
      if (!distance) return;
      const next = Math.max(2, Math.ceil((view.clientWidth + distance) / distance));
      distanceRef.current = distance;
      setCopies((current) => current === next ? current : next);
      group.parentElement?.style.setProperty("--announcement-distance", `${distance}px`);
      view.style.setProperty("--announcement-duration", `${distance / SPEED}s`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(view);
    observer.observe(group);
    return () => observer.disconnect();
  }, [data.reviews.length]);

  useLayoutEffect(() => {
    if (browsing && viewport.current && pendingOffset.current !== null) {
      viewport.current.scrollLeft = pendingOffset.current;
      pendingOffset.current = null;
    }
  }, [browsing]);
  useEffect(() => () => { if (resumeTimer.current) clearTimeout(resumeTimer.current); }, []);

  function beginBrowsing(mode: "keyboard" | "touch") {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    if (!browsingMode.current && viewport.current && segment.current) {
      const sourceWidth = distanceRef.current;
      const offset = viewport.current.getBoundingClientRect().left - segment.current.getBoundingClientRect().left;
      // Keyboard navigation starts at the original source set, while a swipe
      // retains the currently visible review rather than jumping to the first.
      pendingOffset.current = mode === "touch" && sourceWidth ? ((offset % sourceWidth) + sourceWidth) % sourceWidth : 0;
    }
    browsingMode.current = mode;
    setBrowsing(mode);
  }
  function endBrowsing() {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    const view = viewport.current;
    if (view && browsingMode.current) {
      const total = distanceRef.current;
      const offset = view.scrollLeft;
      // Re-enter the existing CSS cycle at the visible position, not time zero.
      if (total) view.style.setProperty("--reviews-delay", `-${((total - offset) % total) / SPEED}s`);
      view.scrollLeft = 0;
    }
    browsingMode.current = null;
    setBrowsing(null);
  }
  function resumeAfterTouch() {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => { if (browsingMode.current === "touch") endBrowsing(); }, 700);
  }
  if (!data.reviews.length) return null;
  return <section id="reviews" aria-label="Google reviews" className={`${styles.section} font-primary`}
    data-browsing={browsing ?? undefined} data-touching={touching}>
    <div className={`page-container ${styles.container}`}>
    <div className={styles.viewport} ref={viewport} role="region" tabIndex={0}
      aria-label="Client reviews. Focus or swipe to browse; select review text to read the full original."
      onFocusCapture={(event) => {
        // Touch browsers can focus AFTER pointer-up. Such focus is not a
        // keyboard reading session and must not latch the static layout.
        if (pointerFocus.current || !(event.target as HTMLElement).matches(":focus-visible")) pointerFocus.current = false;
        else beginBrowsing("keyboard");
      }}
      onBlurCapture={(event) => {
        if (browsingMode.current === "keyboard" && !event.currentTarget.contains(event.relatedTarget as Node | null)) endBrowsing();
      }}
      onPointerDown={(event) => {
        pointerFocus.current = true;
        if (event.pointerType !== "mouse") {
          touchStart.current = event.clientX;
          touchHeld.current = true;
          setTouching(true);
          if (resumeTimer.current) clearTimeout(resumeTimer.current);
          if (!(event.target as HTMLElement).closest("a")) beginBrowsing("touch");
        }
      }}
      onPointerMove={(event) => {
        if (browsingMode.current !== "touch" && touchStart.current !== null && Math.abs(event.clientX - touchStart.current) > 10) beginBrowsing("touch");
      }}
      onPointerUp={() => {
        pointerFocus.current = false; touchStart.current = null; touchHeld.current = false; setTouching(false);
        if (browsingMode.current === "touch") resumeAfterTouch();
      }}
      onPointerCancel={() => {
        pointerFocus.current = false; touchStart.current = null; touchHeld.current = false; setTouching(false);
        if (browsingMode.current === "touch") resumeAfterTouch();
      }}
      onScroll={() => { if (browsingMode.current === "touch" && !touchHeld.current) resumeAfterTouch(); }}>
      <div className={`announcement-ticker-track ${styles.track}`} style={{
        "--review-count": data.reviews.length,
        "--reviews-initial-duration": `${data.reviews.length * 350 / SPEED}s`,
      } as CSSProperties}>
        {Array.from({ length: copies }, (_, half) => <div className={`announcement-ticker-segment ${styles.group}`} key={half} ref={half === 0 ? segment : undefined}>
          {data.reviews.map((review, index) => <Review key={`${review.id}-${index}`} review={review} duplicate={half !== 0} />)}
        </div>)}
      </div>
    </div>
    <div className={styles.footer}>
      <div className={styles.attribution}>
        <a className={styles.googleLogo} href={data.mapsUri} target="_blank" rel="noopener noreferrer" aria-label={`${data.name} on Google Maps (opens in a new tab)`}>
          <Image src="/images/attribution/google-maps-white.svg" alt="Google Maps" width={98} height={18} unoptimized />
        </a>
        <span className={styles.order}>By relevance</span>
        {data.attributions.map((a, i) => <span key={`${a.name}-${i}`}>{a.uri ? <a href={a.uri} target="_blank" rel="noopener noreferrer">{a.name}</a> : a.name}</span>)}
      </div>
      <a className={styles.viewAll} href={data.reviewsUri} target="_blank" rel="noopener noreferrer">View all reviews <span aria-hidden="true">↗</span></a>
    </div>
    </div>
  </section>;
}
