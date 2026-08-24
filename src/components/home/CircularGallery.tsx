"use client";

import Image from "next/image";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type WorkItem = {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
  image: string;
};

type CircularGalleryProps = {
  items: WorkItem[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  onInteracted: () => void;
};

type RepeatedSlide = WorkItem & {
  originalIndex: number;
  copyIndex: number;
  renderedIndex: number;
};

const TRACK_COPY_COUNT = 3;
const MIDDLE_COPY_INDEX = Math.floor(TRACK_COPY_COUNT / 2);

function isSupabaseStorageImageUrl(src: string) {
  try {
    const url = new URL(src);
    return (
      url.hostname === "rqavijckrxkecaxnyiex.supabase.co" &&
      url.pathname.startsWith("/storage/v1/object/public/")
    );
  } catch {
    return false;
  }
}

const round = (value: number) => Number(value.toFixed(3));
const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

function getCardVisualStyle(
  centerDistance: number,
  options: {
    isMobile: boolean;
    prefersReducedMotion: boolean;
    isScrolling: boolean;
  },
) {
  const { isMobile, prefersReducedMotion, isScrolling } = options;
  const absolute = Math.abs(centerDistance);
  const clampedDistance = Math.min(absolute, 2.6);
  const proximity = Math.max(0, 1 - clampedDistance / 2.6);
  const easedProximity = 1 - Math.pow(1 - proximity, 2);

  const rotationFactor = isMobile ? 24 : 32;
  const rotationClamp = isMobile ? 36 : 52;
  const depthFactor = isMobile ? 88 : 124;
  const scaleFactor = isMobile ? 0.1 : 0.13;
  const translateXFactor = isMobile ? 18 : 30;
  const translateYFactor = isMobile ? 10 : 14;

  const rotateY = prefersReducedMotion
    ? 0
    : round(
        clamp(centerDistance * -rotationFactor, -rotationClamp, rotationClamp),
      );
  const scale = round(clamp(1 - clampedDistance * scaleFactor, 0.72, 1));
  const translateZ = prefersReducedMotion
    ? 0
    : round(-Math.min(clampedDistance, 2.3) * depthFactor);
  const translateX = round(centerDistance * -translateXFactor);
  const translateY = round(
    Math.pow(1 - easedProximity, 1.25) * translateYFactor,
  );
  const opacity = round(clamp(1 - clampedDistance * 0.16, 0.42, 1));
  const overlayOpacity = round(
    clamp(clampedDistance * (isMobile ? 0.14 : 0.18), 0, 0.42),
  );
  const zIndex = 40 + Math.round(easedProximity * 60);

  return {
    style: {
      transform: `translate3d(${translateX}px, ${translateY}px, ${translateZ}px) scale(${scale}) rotateY(${rotateY}deg)`,
      opacity,
      zIndex,
      transition: prefersReducedMotion
        ? "none"
        : isScrolling
          ? "none"
          : "transform 180ms cubic-bezier(0.22, 1, 0.36, 1), opacity 160ms ease",
    },
    overlayOpacity,
  };
}

export default function CircularGallery({
  items,
  activeIndex,
  onActiveIndexChange,
  onInteracted,
}: CircularGalleryProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const slideRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const scrollFrameRef = useRef<number | null>(null);
  const scrollEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const metadataTimeoutRef = useRef<number | null>(null);
  const activeOriginalIndexRef = useRef(activeIndex);
  const hasInitializedRef = useRef(false);
  const isInternalScrollUpdateRef = useRef(false);
  const isPointerDownRef = useRef(false);
  const sequenceWidthRef = useRef(0);

  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [sideInset, setSideInset] = useState(0);
  const [activeVisualIndex, setActiveVisualIndex] = useState(activeIndex);
  const [scrollerCenter, setScrollerCenter] = useState(0);
  const [cardSpan, setCardSpan] = useState(1);
  const [displayedIndex, setDisplayedIndex] = useState(activeIndex);
  const [metadataPhase, setMetadataPhase] = useState<
    "visible" | "exiting" | "entering"
  >("visible");
  const [isScrolling, setIsScrolling] = useState(false);

  const totalItems = items.length;

  const repeatedSlides = useMemo<RepeatedSlide[]>(() => {
    if (items.length === 0) {
      return [];
    }

    return Array.from({ length: TRACK_COPY_COUNT }, (_, copyIndex) =>
      items.map((item, originalIndex) => ({
        ...item,
        originalIndex,
        copyIndex,
        renderedIndex: copyIndex * items.length + originalIndex,
      })),
    ).flat();
  }, [items]);

  useEffect(() => {
    setHasMounted(true);

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const updatePreference = () => {
      setPrefersReducedMotion(mediaQuery.matches);
    };

    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);

    return () => {
      mediaQuery.removeEventListener("change", updatePreference);
    };
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");

    const updateLayout = () => {
      setIsMobileLayout(mediaQuery.matches);
    };

    updateLayout();
    mediaQuery.addEventListener("change", updateLayout);

    return () => {
      mediaQuery.removeEventListener("change", updateLayout);
    };
  }, []);

  const getRenderedIndexForOriginal = useCallback(
    (originalIndex: number) => MIDDLE_COPY_INDEX * totalItems + originalIndex,
    [totalItems],
  );

  const centerSlide = useCallback(
    (renderedIndex: number, behavior: ScrollBehavior = "smooth") => {
      const scroller = scrollerRef.current;
      const slide = slideRefs.current[renderedIndex];

      if (!scroller || !slide) {
        return;
      }

      const targetLeft =
        slide.offsetLeft - (scroller.clientWidth - slide.offsetWidth) / 2;

      scroller.scrollTo({
        left: Math.max(targetLeft, 0),
        behavior: prefersReducedMotion ? "auto" : behavior,
      });
    },
    [prefersReducedMotion],
  );

  const measureLayout = useCallback(() => {
    const scroller = scrollerRef.current;
    const firstSlide = slideRefs.current[0];
    const secondSlide = slideRefs.current[1];
    const middleFirstSlide = slideRefs.current[MIDDLE_COPY_INDEX * totalItems];
    const nextCopyFirstSlide = slideRefs.current[(MIDDLE_COPY_INDEX + 1) * totalItems];

    if (!scroller || !firstSlide || totalItems === 0) {
      return;
    }

    const nextInset = Math.max(
      (scroller.clientWidth - firstSlide.offsetWidth) / 2,
      0,
    );

    setSideInset(nextInset);
    setScrollerCenter(scroller.scrollLeft + scroller.clientWidth / 2);

    if (secondSlide) {
      const nextSpan = secondSlide.offsetLeft - firstSlide.offsetLeft;

      if (nextSpan > 0) {
        setCardSpan(nextSpan);
      }
    }

    if (middleFirstSlide && nextCopyFirstSlide) {
      const sequenceWidth =
        nextCopyFirstSlide.offsetLeft - middleFirstSlide.offsetLeft;

      if (sequenceWidth > 0) {
        sequenceWidthRef.current = sequenceWidth;
      }
    }
  }, [totalItems]);

  const updateScrollState = useCallback(() => {
    const scroller = scrollerRef.current;

    if (!scroller || repeatedSlides.length === 0) {
      return;
    }

    const containerCenter = scroller.scrollLeft + scroller.clientWidth / 2;

    setScrollerCenter(containerCenter);

    let closestRenderedIndex = 0;
    let smallestDistance = Number.POSITIVE_INFINITY;

    slideRefs.current.forEach((slide, index) => {
      if (!slide) {
        return;
      }

      const slideCenter = slide.offsetLeft + slide.offsetWidth / 2;
      const distance = Math.abs(slideCenter - containerCenter);

      if (distance < smallestDistance) {
        smallestDistance = distance;
        closestRenderedIndex = index;
      }
    });

    const nextOriginalIndex =
      repeatedSlides[closestRenderedIndex]?.originalIndex ?? 0;

    setActiveVisualIndex(nextOriginalIndex);

    if (nextOriginalIndex !== activeOriginalIndexRef.current) {
      activeOriginalIndexRef.current = nextOriginalIndex;
      isInternalScrollUpdateRef.current = true;
      onActiveIndexChange(nextOriginalIndex);
    }
  }, [onActiveIndexChange, repeatedSlides]);

  const recenterToMiddleCopy = useCallback(() => {
    const scroller = scrollerRef.current;
    const sequenceWidth = sequenceWidthRef.current;

    if (!scroller || !sequenceWidth || totalItems === 0) {
      setIsScrolling(false);
      updateScrollState();
      return;
    }

    const containerCenter = scroller.scrollLeft + scroller.clientWidth / 2;
    let closestRenderedIndex = 0;
    let smallestDistance = Number.POSITIVE_INFINITY;

    slideRefs.current.forEach((slide, index) => {
      if (!slide) {
        return;
      }

      const slideCenter = slide.offsetLeft + slide.offsetWidth / 2;
      const distance = Math.abs(slideCenter - containerCenter);

      if (distance < smallestDistance) {
        smallestDistance = distance;
        closestRenderedIndex = index;
      }
    });

    const closestSlide = repeatedSlides[closestRenderedIndex];

    if (!closestSlide) {
      setIsScrolling(false);
      updateScrollState();
      return;
    }

    if (closestSlide.copyIndex === 0) {
      scroller.scrollLeft += sequenceWidth;
    } else if (closestSlide.copyIndex === TRACK_COPY_COUNT - 1) {
      scroller.scrollLeft -= sequenceWidth;
    }

    setIsScrolling(false);
    updateScrollState();
  }, [repeatedSlides, totalItems, updateScrollState]);

  const handleScrollSettled = useCallback(() => {
    if (isPointerDownRef.current) {
      return;
    }

    recenterToMiddleCopy();
  }, [recenterToMiddleCopy]);

  const handleScroll = useCallback(() => {
    onInteracted();
    setIsScrolling(true);

    if (scrollFrameRef.current !== null) {
      return;
    }

    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      updateScrollState();
    });

    if (scrollEndTimerRef.current) {
      clearTimeout(scrollEndTimerRef.current);
    }

    scrollEndTimerRef.current = setTimeout(() => {
      handleScrollSettled();
    }, 160);
  }, [handleScrollSettled, onInteracted, updateScrollState]);

  const scrollByDirection = useCallback(
    (direction: "left" | "right") => {
      const scroller = scrollerRef.current;
      const firstSlide = slideRefs.current[0];

      if (!scroller || !firstSlide) {
        return;
      }

      const style = window.getComputedStyle(scroller);
      const gap = Number.parseFloat(style.columnGap || style.gap || "0");
      const step = firstSlide.offsetWidth + (Number.isFinite(gap) ? gap : 0);

      if (!step) {
        return;
      }

      onInteracted();
      scroller.scrollBy({
        left: direction === "left" ? -step : step,
        behavior: prefersReducedMotion ? "auto" : "smooth",
      });
    },
    [onInteracted, prefersReducedMotion],
  );

  useEffect(() => {
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      requestAnimationFrame(() => {
        const renderedIndex = getRenderedIndexForOriginal(activeIndex);
        centerSlide(renderedIndex, "auto");
        activeOriginalIndexRef.current = activeIndex;
        measureLayout();
        updateScrollState();
      });
      return;
    }

    if (isInternalScrollUpdateRef.current) {
      isInternalScrollUpdateRef.current = false;
      return;
    }

    requestAnimationFrame(() => {
      const renderedIndex = getRenderedIndexForOriginal(activeIndex);
      centerSlide(renderedIndex, "smooth");
      activeOriginalIndexRef.current = activeIndex;
      measureLayout();
      updateScrollState();
    });
  }, [
    activeIndex,
    centerSlide,
    getRenderedIndexForOriginal,
    measureLayout,
    updateScrollState,
  ]);

  useEffect(() => {
    if (metadataTimeoutRef.current !== null) {
      window.clearTimeout(metadataTimeoutRef.current);
      metadataTimeoutRef.current = null;
    }

    if (displayedIndex === activeIndex) {
      setMetadataPhase("visible");
      return;
    }

    if (prefersReducedMotion) {
      setDisplayedIndex(activeIndex);
      setMetadataPhase("visible");
      return;
    }

    setMetadataPhase("exiting");

    metadataTimeoutRef.current = window.setTimeout(() => {
      setDisplayedIndex(activeIndex);
      setMetadataPhase("entering");

      metadataTimeoutRef.current = window.setTimeout(() => {
        setMetadataPhase("visible");
        metadataTimeoutRef.current = null;
      }, 180);
    }, 160);

    return () => {
      if (metadataTimeoutRef.current !== null) {
        window.clearTimeout(metadataTimeoutRef.current);
        metadataTimeoutRef.current = null;
      }
    };
  }, [activeIndex, displayedIndex, prefersReducedMotion]);

  useEffect(() => {
    measureLayout();
    updateScrollState();

    const scroller = scrollerRef.current;
    if (!scroller || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      measureLayout();
      const renderedIndex = getRenderedIndexForOriginal(activeOriginalIndexRef.current);
      centerSlide(renderedIndex, "auto");
      updateScrollState();
    });

    resizeObserverRef.current = observer;
    observer.observe(scroller);

    slideRefs.current.forEach((slide) => {
      if (slide) {
        observer.observe(slide);
      }
    });

    const handleResize = () => {
      measureLayout();
      const renderedIndex = getRenderedIndexForOriginal(
        activeOriginalIndexRef.current,
      );
      centerSlide(renderedIndex, "auto");
      updateScrollState();
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);

    return () => {
      observer.disconnect();
      resizeObserverRef.current = null;
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, [centerSlide, getRenderedIndexForOriginal, measureLayout, updateScrollState]);

  useEffect(() => {
    const scroller = scrollerRef.current;

    if (!scroller || !("onscrollend" in scroller)) {
      return;
    }

    const handleNativeScrollEnd = () => {
      handleScrollSettled();
    };

    scroller.addEventListener("scrollend", handleNativeScrollEnd);

    return () => {
      scroller.removeEventListener("scrollend", handleNativeScrollEnd);
    };
  }, [handleScrollSettled]);

  useEffect(() => {
    return () => {
      if (scrollFrameRef.current !== null) {
        cancelAnimationFrame(scrollFrameRef.current);
      }
      if (scrollEndTimerRef.current !== null) {
        clearTimeout(scrollEndTimerRef.current);
      }
      if (metadataTimeoutRef.current !== null) {
        window.clearTimeout(metadataTimeoutRef.current);
      }
    };
  }, []);

  const goToPrevious = useCallback(() => {
    scrollByDirection("left");
  }, [scrollByDirection]);

  const goToNext = useCallback(() => {
    scrollByDirection("right");
  }, [scrollByDirection]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToPrevious();
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        goToNext();
      }
    },
    [goToNext, goToPrevious],
  );

  const galleryCards = useMemo(() => {
    return repeatedSlides.map((item, renderedIndex) => {
      const slide = slideRefs.current[renderedIndex];
      const fallbackDistance = item.originalIndex - activeVisualIndex;
      const centerDistance =
        hasMounted && slide && scrollerCenter > 0
          ? (slide.offsetLeft + slide.offsetWidth / 2 - scrollerCenter) /
            Math.max(cardSpan, 1)
          : fallbackDistance;
      const { style, overlayOpacity } = getCardVisualStyle(centerDistance, {
        isMobile: isMobileLayout,
        prefersReducedMotion,
        isScrolling,
      });

      return {
        ...item,
        style,
        overlayOpacity,
      };
    });
  }, [
    activeVisualIndex,
    cardSpan,
    hasMounted,
    isMobileLayout,
    isScrolling,
    repeatedSlides,
    prefersReducedMotion,
    scrollerCenter,
  ]);

  return (
    <div className="space-y-6 sm:space-y-8">
      <div
        className="relative mx-auto overflow-hidden [perspective:900px] [perspective-origin:center_center] md:[perspective:1200px] xl:[perspective:1400px]"
        tabIndex={0}
        role="region"
        aria-label="Selected Work gallery"
        onKeyDown={handleKeyDown}
      >
        <div
          ref={scrollerRef}
          onScroll={handleScroll}
          onPointerDown={() => {
            isPointerDownRef.current = true;
          }}
          onPointerUp={() => {
            isPointerDownRef.current = false;
          }}
          onPointerCancel={() => {
            isPointerDownRef.current = false;
          }}
          className="flex snap-x snap-mandatory overflow-x-auto overflow-y-hidden [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden"
          style={{
            paddingInline: `${sideInset}px`,
            scrollbarWidth: "none",
            scrollBehavior: prefersReducedMotion ? "auto" : "smooth",
          }}
        >
          {galleryCards.map((item, renderedIndex) => (
            <button
              key={`copy-${item.copyIndex}-item-${item.id}`}
              ref={(node) => {
                slideRefs.current[renderedIndex] = node;
              }}
              type="button"
              onClick={() => {
                onInteracted();
                setIsScrolling(true);
                isInternalScrollUpdateRef.current = true;
                centerSlide(renderedIndex, "smooth");
                onActiveIndexChange(item.originalIndex);
              }}
              className="snap-center flex-none px-2 text-left [transform-style:preserve-3d] [will-change:transform,opacity,filter] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent sm:px-3 lg:px-4"
              aria-pressed={item.originalIndex === activeIndex}
              aria-label={` `}
              style={item.style}
            >
              <div className="w-[82vw] min-w-[82vw] max-w-[420px] overflow-hidden rounded-[0.35rem] bg-surface sm:w-[380px] sm:min-w-[380px] lg:w-[420px] lg:min-w-[420px]">
                <div className="relative aspect-[4/5] w-full">
                  <Image
                    src={item.image}
                    alt={item.title}
                    fill
                    sizes="(min-width: 1024px) 420px, (min-width: 640px) 380px, 82vw"
                    className="pointer-events-none object-cover [-webkit-user-drag:none]"
                    priority={
                      item.copyIndex === MIDDLE_COPY_INDEX &&
                      item.originalIndex === activeIndex
                    }
                    draggable={false}
                    unoptimized={isSupabaseStorageImageUrl(item.image)}
                  />
                  <div
                    className="pointer-events-none absolute inset-0 bg-black transition-opacity duration-150"
                    style={{ opacity: item.overlayOpacity }}
                  />
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col items-center gap-4 text-center">
        <div
          className={`space-y-2 ${
            prefersReducedMotion
              ? ""
              : "transition-[transform,opacity] duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
          } ${
            metadataPhase === "exiting"
              ? "-translate-y-2 opacity-0"
              : metadataPhase === "entering"
                ? "translate-y-2 opacity-0"
                : "translate-y-0 opacity-100"
          }`}
        >
          <p className="font-primary text-xs uppercase tracking-[0.32em] text-foreground-secondary">
            {String(displayedIndex + 1).padStart(2, "0")} / {" "}
            {String(items.length).padStart(2, "0")}
          </p>
          <h3 className="font-display text-[clamp(1.8rem,4vw,2.5rem)] uppercase leading-none tracking-[-0.04em] text-foreground">
            {items[displayedIndex].title}
          </h3>
          {items[displayedIndex].subtitle ? (
            <p className="font-primary text-xs uppercase tracking-[0.28em] text-foreground-muted sm:text-sm">
              {items[displayedIndex].subtitle}
            </p>
          ) : null}
          {items[displayedIndex].meta ? (
            <p className="font-primary text-xs uppercase tracking-[0.28em] text-foreground-muted sm:text-sm">
              {items[displayedIndex].meta}
            </p>
          ) : null}
        </div>

        <div className="relative z-20 flex items-center justify-center gap-6 pt-1 sm:gap-8">
          <button
            type="button"
            onClick={goToPrevious}
            className="inline-flex min-h-12 min-w-12 touch-manipulation items-center justify-center font-primary text-sm uppercase tracking-[0.26em] text-foreground-secondary transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:text-foreground-secondary"
            aria-label="Previous work"
          >
            ←
          </button>
          <button
            type="button"
            onClick={goToNext}
            className="inline-flex min-h-12 min-w-12 touch-manipulation items-center justify-center font-primary text-sm uppercase tracking-[0.26em] text-foreground-secondary transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:text-foreground-secondary"
            aria-label="Next work"
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}
