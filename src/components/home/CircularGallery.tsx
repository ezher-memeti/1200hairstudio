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
  category: string;
  duration: string;
  image: string;
};

type CircularGalleryProps = {
  items: WorkItem[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  onInteracted: () => void;
};

type RenderedSlide = WorkItem & {
  key: string;
  originalIndex: number;
  isClone: boolean;
};

const round = (value: number) => Number(value.toFixed(3));

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
  const isCorrectingLoopRef = useRef(false);
  const activeOriginalIndexRef = useRef(activeIndex);
  const hasInitializedRef = useRef(false);
  const isInternalScrollUpdateRef = useRef(false);

  const [prefersReducedMotion, setPrefersReducedMotion] =
    useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const [sideInset, setSideInset] = useState(0);
  const [activeVisualIndex, setActiveVisualIndex] =
    useState(activeIndex);
  const [scrollerCenter, setScrollerCenter] = useState(0);
  const [cardSpan, setCardSpan] = useState(1);
  const [displayedIndex, setDisplayedIndex] = useState(activeIndex);
  const [metadataPhase, setMetadataPhase] = useState<
    "visible" | "exiting" | "entering"
  >("visible");
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const totalItems = items.length;

  const renderedSlides = useMemo<RenderedSlide[]>(() => {
    if (items.length === 0) {
      return [];
    }

    return [
      {
        ...items[items.length - 1],
        key: `clone-last-${items[items.length - 1].id}`,
        originalIndex: items.length - 1,
        isClone: true,
      },
      ...items.map((item, index) => ({
        ...item,
        key: `real-${item.id}-${index}`,
        originalIndex: index,
        isClone: false,
      })),
      {
        ...items[0],
        key: `clone-first-${items[0].id}`,
        originalIndex: 0,
        isClone: true,
      },
    ];
  }, [items]);

  useEffect(() => {
    setHasMounted(true);

    const mediaQuery = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );

    const updatePreference = () => {
      setPrefersReducedMotion(mediaQuery.matches);
    };

    updatePreference();
    mediaQuery.addEventListener(
      "change",
      updatePreference,
    );

    return () => {
      mediaQuery.removeEventListener(
        "change",
        updatePreference,
      );
    };
  }, []);

  const getScrollStep = useCallback(() => {
    const scroller = scrollerRef.current;
    const firstSlide = scroller?.firstElementChild as
      | HTMLElement
      | null;

    if (!scroller || !firstSlide) {
      return 0;
    }

    const style = window.getComputedStyle(scroller);
    const gap = Number.parseFloat(
      style.columnGap || style.gap || "0",
    );

    return (
      firstSlide.offsetWidth +
      (Number.isFinite(gap) ? gap : 0)
    );
  }, []);

  const centerSlide = useCallback(
    (renderedIndex: number, behavior: ScrollBehavior = "smooth") => {
      const scroller = scrollerRef.current;
      const slide = slideRefs.current[renderedIndex];

      if (!scroller || !slide) {
        return;
      }

      const targetLeft =
        slide.offsetLeft -
        (scroller.clientWidth - slide.offsetWidth) / 2;

      scroller.scrollTo({
        left: Math.max(targetLeft, 0),
        behavior: prefersReducedMotion ? "auto" : behavior,
      });
    },
    [prefersReducedMotion],
  );

  const getRenderedIndexForOriginal = useCallback(
    (originalIndex: number) => originalIndex + 1,
    [],
  );

  const measureLayout = useCallback(() => {
    const scroller = scrollerRef.current;
    const firstRealSlide = slideRefs.current[1];
    const secondRealSlide = slideRefs.current[2];

    if (!scroller || !firstRealSlide) {
      return;
    }

    const nextInset = Math.max(
      (scroller.clientWidth - firstRealSlide.offsetWidth) / 2,
      0,
    );

    setSideInset(nextInset);
    setScrollerCenter(
      scroller.scrollLeft + scroller.clientWidth / 2,
    );

    if (secondRealSlide) {
      const nextSpan =
        secondRealSlide.offsetLeft - firstRealSlide.offsetLeft;

      if (nextSpan > 0) {
        setCardSpan(nextSpan);
      }
    }
  }, []);

  const updateScrollState = useCallback(() => {
    const scroller = scrollerRef.current;

    if (!scroller || renderedSlides.length === 0) {
      return;
    }

    const containerCenter =
      scroller.scrollLeft + scroller.clientWidth / 2;

    setCanScrollLeft(true);
    setCanScrollRight(true);
    setScrollerCenter(containerCenter);

    let closestRenderedIndex = 0;
    let smallestDistance = Number.POSITIVE_INFINITY;

    slideRefs.current.forEach((slide, index) => {
      if (!slide) {
        return;
      }

      const slideCenter =
        slide.offsetLeft + slide.offsetWidth / 2;
      const distance = Math.abs(
        slideCenter - containerCenter,
      );

      if (distance < smallestDistance) {
        smallestDistance = distance;
        closestRenderedIndex = index;
      }
    });

    const nextOriginalIndex =
      renderedSlides[closestRenderedIndex]?.originalIndex ?? 0;

    setActiveVisualIndex(nextOriginalIndex);

    if (nextOriginalIndex !== activeOriginalIndexRef.current) {
      activeOriginalIndexRef.current = nextOriginalIndex;
      isInternalScrollUpdateRef.current = true;
      onActiveIndexChange(nextOriginalIndex);
    }
  }, [onActiveIndexChange, renderedSlides]);

  const handleScrollEnd = useCallback(() => {
    const scroller = scrollerRef.current;

    if (
      !scroller ||
      renderedSlides.length === 0 ||
      isCorrectingLoopRef.current
    ) {
      return;
    }

    const containerCenter =
      scroller.scrollLeft + scroller.clientWidth / 2;
    let currentRenderedIndex = 0;
    let smallestDistance = Number.POSITIVE_INFINITY;

    slideRefs.current.forEach((slide, index) => {
      if (!slide) {
        return;
      }

      const slideCenter =
        slide.offsetLeft + slide.offsetWidth / 2;
      const distance = Math.abs(
        slideCenter - containerCenter,
      );

      if (distance < smallestDistance) {
        smallestDistance = distance;
        currentRenderedIndex = index;
      }
    });

    if (currentRenderedIndex === 0) {
      isCorrectingLoopRef.current = true;
      centerSlide(totalItems, "auto");
      requestAnimationFrame(() => {
        isCorrectingLoopRef.current = false;
        setIsScrolling(false);
        updateScrollState();
      });
      return;
    }

    if (currentRenderedIndex === renderedSlides.length - 1) {
      isCorrectingLoopRef.current = true;
      centerSlide(1, "auto");
      requestAnimationFrame(() => {
        isCorrectingLoopRef.current = false;
        setIsScrolling(false);
        updateScrollState();
      });
      return;
    }

    setIsScrolling(false);
    updateScrollState();
  }, [centerSlide, renderedSlides, totalItems, updateScrollState]);

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
      handleScrollEnd();
    }, 160);
  }, [handleScrollEnd, onInteracted, updateScrollState]);

  const scrollByDirection = useCallback(
    (direction: "left" | "right") => {
      const scroller = scrollerRef.current;

      if (!scroller) {
        return;
      }

      const step = getScrollStep();

      if (!step) {
        return;
      }

      onInteracted();
      scroller.scrollBy({
        left: direction === "left" ? -step : step,
        behavior: prefersReducedMotion ? "auto" : "smooth",
      });
    },
    [getScrollStep, onInteracted, prefersReducedMotion],
  );

  useEffect(() => {
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      requestAnimationFrame(() => {
        centerSlide(getRenderedIndexForOriginal(activeIndex), "auto");
        activeOriginalIndexRef.current = activeIndex;
        updateScrollState();
      });
      return;
    }

    if (isInternalScrollUpdateRef.current) {
      isInternalScrollUpdateRef.current = false;
      return;
    }

    requestAnimationFrame(() => {
      centerSlide(getRenderedIndexForOriginal(activeIndex), "smooth");
      activeOriginalIndexRef.current = activeIndex;
      updateScrollState();
    });
  }, [activeIndex, centerSlide, getRenderedIndexForOriginal, updateScrollState]);

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
      updateScrollState();
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener(
      "orientationchange",
      handleResize,
    );

    return () => {
      observer.disconnect();
      resizeObserverRef.current = null;
      window.removeEventListener("resize", handleResize);
      window.removeEventListener(
        "orientationchange",
        handleResize,
      );
    };
  }, [measureLayout, renderedSlides.length, updateScrollState]);

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
    return renderedSlides.map((item, renderedIndex) => {
      const visualIndex = item.originalIndex;
      const slide = slideRefs.current[renderedIndex];
      const fallbackDistance = Math.abs(
        visualIndex - activeVisualIndex,
      );
      const centerDistance =
        hasMounted && slide && scrollerCenter > 0
          ? (slide.offsetLeft + slide.offsetWidth / 2 - scrollerCenter) /
            Math.max(cardSpan, 1)
          : fallbackDistance;
      const absolute = Math.abs(centerDistance);
      const clampedDistance = Math.min(absolute, 2.4);
      const proximity = Math.max(0, 1 - clampedDistance / 2.4);
      const easedProximity = 1 - Math.pow(1 - proximity, 2.1);
      const translateY = round(
        Math.pow(1 - easedProximity, 1.35) * 46,
      );
      const scale = round(0.78 + easedProximity * 0.22);
      const opacity = round(0.4 + easedProximity * 0.6);
      const blur = round(
        prefersReducedMotion || isScrolling
          ? 0
          : (1 - easedProximity) * 1.5,
      );
      const rotateY = round(
        Math.max(-8, Math.min(8, centerDistance * -5)),
      );
      const translateX = round(
        Math.max(-10, Math.min(10, centerDistance * -6)),
      );
      const zIndex = 40 + Math.round(easedProximity * 60);

      return {
        ...item,
        style: {
          transform: `translate3d(${translateX}px, ${translateY}px, 0) scale(${scale}) rotateY(${rotateY}deg)`,
          opacity,
          filter: `blur(${blur}px)`,
          zIndex,
          transition: prefersReducedMotion
            ? "none"
            : isScrolling
              ? "none"
              : "transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease, filter 180ms ease",
        },
      };
    });
  }, [
    activeVisualIndex,
    cardSpan,
    hasMounted,
    isScrolling,
    renderedSlides,
    prefersReducedMotion,
    scrollerCenter,
  ]);

  return (
    <div className="space-y-6 sm:space-y-8">
      <div
        className="relative mx-auto overflow-hidden"
        tabIndex={0}
        role="region"
        aria-label="Selected Work gallery"
        onKeyDown={handleKeyDown}
      >
        <div
          ref={scrollerRef}
          onScroll={handleScroll}
          className="flex snap-x snap-mandatory overflow-x-auto overflow-y-hidden [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden"
          style={{
            paddingInline: `${sideInset}px`,
            scrollbarWidth: "none",
            scrollBehavior: prefersReducedMotion ? "auto" : "smooth",
          }}
        >
          {galleryCards.map((item, renderedIndex) => (
            <button
              key={item.key}
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
              aria-label={`${item.id} ${item.title}`}
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
                      renderedIndex === getRenderedIndexForOriginal(activeIndex)
                    }
                    draggable={false}
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
            {String(displayedIndex + 1).padStart(2, "0")} /{" "}
            {String(items.length).padStart(2, "0")}
          </p>
          <h3 className="font-display text-[clamp(1.8rem,4vw,2.5rem)] uppercase leading-none tracking-[-0.04em] text-foreground">
            {items[displayedIndex].title}
          </h3>
          <p className="font-primary text-xs uppercase tracking-[0.28em] text-foreground-muted sm:text-sm">
            {items[displayedIndex].category}
          </p>
          <p className="font-primary text-xs uppercase tracking-[0.28em] text-foreground-muted sm:text-sm">
            {items[displayedIndex].duration}
          </p>
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
