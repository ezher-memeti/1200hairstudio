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

type DisplayItem = WorkItem & {
  cloneIndex: number;
  originalIndex: number;
};

const LOOP_SETS = 3;
const CENTER_SET_INDEX = 1;

function getShortestDistance(value: number, total: number) {
  const half = total / 2;

  if (value > half) {
    return value - total;
  }

  if (value < -half) {
    return value + total;
  }

  return value;
}

export default function CircularGallery({
  items,
  activeIndex,
  onActiveIndexChange,
  onInteracted,
}: CircularGalleryProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const scrollFrameRef = useRef<number | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const hasInitializedRef = useRef(false);
  const lastSettledIndexRef = useRef(activeIndex);
  const metadataTimeoutRef = useRef<number | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] =
    useState(false);
  const [sideInset, setSideInset] = useState(0);
  const [activeCloneIndex, setActiveCloneIndex] = useState(0);
  const [scrollerCenter, setScrollerCenter] = useState(0);
  const [cardSpan, setCardSpan] = useState(1);
  const [displayedIndex, setDisplayedIndex] = useState(activeIndex);
  const [metadataPhase, setMetadataPhase] = useState<
    "visible" | "exiting" | "entering"
  >("visible");

  const totalItems = items.length;

  const displayItems = useMemo<DisplayItem[]>(() => {
    return Array.from({ length: LOOP_SETS }, (_, setIndex) =>
      items.map((item, index) => ({
        ...item,
        cloneIndex: setIndex * totalItems + index,
        originalIndex: index,
      })),
    ).flat();
  }, [items, totalItems]);

  const getMiddleCloneIndex = useCallback(
    (index: number) => CENTER_SET_INDEX * totalItems + index,
    [totalItems],
  );

  useEffect(() => {
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

  const centerClone = useCallback(
    (
      cloneIndex: number,
      behavior: ScrollBehavior = "smooth",
    ) => {
      const scroller = scrollRef.current;
      const node = itemRefs.current[cloneIndex];

      if (!scroller || !node) {
        return;
      }

      const targetLeft =
        node.offsetLeft -
        (scroller.clientWidth - node.offsetWidth) / 2;

      scroller.scrollTo({
        left: Math.max(targetLeft, 0),
        behavior: prefersReducedMotion ? "auto" : behavior,
      });
    },
    [prefersReducedMotion],
  );

  const animateToClone = useCallback(
    (cloneIndex: number) => {
      setActiveCloneIndex(cloneIndex);
      centerClone(cloneIndex, "smooth");
    },
    [centerClone],
  );

  const measureSideInset = useCallback(() => {
    const scroller = scrollRef.current;
    const middleClone = itemRefs.current[getMiddleCloneIndex(0)];
    const nextMiddleClone = itemRefs.current[getMiddleCloneIndex(1)];

    if (!scroller || !middleClone) {
      return;
    }

    const nextInset = Math.max(
      (scroller.clientWidth - middleClone.offsetWidth) / 2,
      0,
    );

    setSideInset(nextInset);
    setScrollerCenter(
      scroller.scrollLeft + scroller.clientWidth / 2,
    );

    if (nextMiddleClone) {
      const nextSpan =
        nextMiddleClone.offsetLeft - middleClone.offsetLeft;

      if (nextSpan > 0) {
        setCardSpan(nextSpan);
      }
    }
  }, [getMiddleCloneIndex]);

  const recenterIfNeeded = useCallback(() => {
    const scroller = scrollRef.current;
    const firstMiddleNode = itemRefs.current[getMiddleCloneIndex(0)];
    const firstLastSetNode = itemRefs.current[
      getMiddleCloneIndex(0) + totalItems
    ];

    if (!scroller || !firstMiddleNode || !firstLastSetNode) {
      return;
    }

    const setWidth =
      firstLastSetNode.offsetLeft - firstMiddleNode.offsetLeft;

    if (setWidth <= 0) {
      return;
    }

    const minThreshold = setWidth * 0.5;
    const maxThreshold = setWidth * 1.5;

    if (scroller.scrollLeft < minThreshold) {
      scroller.scrollLeft += setWidth;
    } else if (scroller.scrollLeft > maxThreshold) {
      scroller.scrollLeft -= setWidth;
    }
  }, [getMiddleCloneIndex, totalItems]);

  const updateActiveFromScroll = useCallback(() => {
    scrollFrameRef.current = null;
    const scroller = scrollRef.current;

    if (!scroller) {
      return;
    }

    recenterIfNeeded();

    const scrollerCenter =
      scroller.scrollLeft + scroller.clientWidth / 2;
    setScrollerCenter(scrollerCenter);
    let closestCloneIndex = activeCloneIndex;
    let closestDistance = Number.POSITIVE_INFINITY;

    itemRefs.current.forEach((node, index) => {
      if (!node) {
        return;
      }

      const cardCenter =
        node.offsetLeft + node.offsetWidth / 2;
      const distance = Math.abs(cardCenter - scrollerCenter);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestCloneIndex = index;
      }
    });

    setActiveCloneIndex(closestCloneIndex);

    const nextActiveIndex =
      closestCloneIndex % totalItems;

    if (lastSettledIndexRef.current !== nextActiveIndex) {
      lastSettledIndexRef.current = nextActiveIndex;
      onActiveIndexChange(nextActiveIndex);
    }
  }, [
    activeCloneIndex,
    onActiveIndexChange,
    recenterIfNeeded,
    totalItems,
  ]);

  const handleScroll = useCallback(() => {
    onInteracted();

    if (scrollFrameRef.current !== null) {
      cancelAnimationFrame(scrollFrameRef.current);
    }

    scrollFrameRef.current = window.requestAnimationFrame(
      updateActiveFromScroll,
    );
  }, [onInteracted, updateActiveFromScroll]);

  useEffect(() => {
    const middleIndex = getMiddleCloneIndex(activeIndex);
    lastSettledIndexRef.current = activeIndex;

    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      setActiveCloneIndex(middleIndex);
      requestAnimationFrame(() => {
        centerClone(middleIndex, "auto");
      });
      return;
    }
    animateToClone(middleIndex);
  }, [activeIndex, animateToClone, centerClone, getMiddleCloneIndex]);

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
    measureSideInset();

    const scroller = scrollRef.current;
    if (!scroller || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      measureSideInset();
      recenterIfNeeded();
    });

    resizeObserverRef.current = observer;
    observer.observe(scroller);

    itemRefs.current.forEach((node) => {
      if (node) {
        observer.observe(node);
      }
    });

    return () => {
      observer.disconnect();
      resizeObserverRef.current = null;
    };
  }, [displayItems.length, measureSideInset, recenterIfNeeded]);

  useEffect(() => {
    return () => {
      if (scrollFrameRef.current !== null) {
        cancelAnimationFrame(scrollFrameRef.current);
      }

      if (metadataTimeoutRef.current !== null) {
        window.clearTimeout(metadataTimeoutRef.current);
      }
    };
  }, []);

  const stepBy = useCallback(
    (direction: -1 | 1) => {
      const targetCloneIndex = activeCloneIndex + direction;
      const targetIndex =
        ((targetCloneIndex % totalItems) + totalItems) %
        totalItems;

      onInteracted();
      setActiveCloneIndex(targetCloneIndex);
      animateToClone(targetCloneIndex);
      onActiveIndexChange(targetIndex);
    },
    [
      activeCloneIndex,
      animateToClone,
      onActiveIndexChange,
      onInteracted,
      totalItems,
    ],
  );

  const goToPrevious = useCallback(() => {
    stepBy(-1);
  }, [stepBy]);

  const goToNext = useCallback(() => {
    stepBy(1);
  }, [stepBy]);

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
    return displayItems.map((item) => {
      const node = itemRefs.current[item.cloneIndex];
      const fallbackDistance = Math.abs(
        getShortestDistance(
          item.cloneIndex - activeCloneIndex,
          displayItems.length,
        ),
      );
      const centerDistance =
        node && scrollerCenter > 0
          ? (node.offsetLeft + node.offsetWidth / 2 - scrollerCenter) /
            Math.max(cardSpan, 1)
          : fallbackDistance;
      const absolute = Math.abs(centerDistance);
      const clampedDistance = Math.min(absolute, 2.4);
      const proximity = Math.max(0, 1 - clampedDistance / 2.4);
      const easedProximity = 1 - Math.pow(1 - proximity, 2.1);
      const translateY =
        Math.pow(1 - easedProximity, 1.35) * 46;
      const scale = 0.78 + easedProximity * 0.22;
      const opacity = 0.4 + easedProximity * 0.6;
      const blur = prefersReducedMotion
        ? 0
        : (1 - easedProximity) * 3;
      const rotateY = Math.max(
        -8,
        Math.min(8, centerDistance * -5),
      );
      const translateX = Math.max(
        -10,
        Math.min(10, centerDistance * -6),
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
            : "transform 520ms cubic-bezier(0.22, 1, 0.36, 1), opacity 420ms ease, filter 420ms ease",
        },
      };
    });
  }, [
    activeCloneIndex,
    cardSpan,
    displayItems,
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
          ref={scrollRef}
          className="flex h-[22rem] touch-pan-y items-center overflow-x-auto overflow-y-hidden overscroll-x-contain scrollbar-none select-none [scrollbar-width:none] [-ms-overflow-style:none] min-[390px]:h-[24rem] sm:h-[28rem] md:h-[31rem] lg:h-[34rem] xl:h-[36rem]"
          onScroll={handleScroll}
          style={{
            paddingInline: `${sideInset}px`,
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
        >
          {galleryCards.map((item) => (
            <button
              key={`${item.cloneIndex}-${item.id}`}
              ref={(node) => {
                itemRefs.current[item.cloneIndex] = node;
              }}
              type="button"
              onClick={() => {
                onInteracted();
                animateToClone(item.cloneIndex);
                onActiveIndexChange(item.originalIndex);
              }}
              className="flex-none px-2 text-left [transform-style:preserve-3d] [will-change:transform,opacity,filter] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent sm:px-4"
              aria-pressed={item.originalIndex === activeIndex}
              aria-label={`${item.id} ${item.title}`}
              style={item.style}
            >
              <div className="w-[74vw] min-w-[220px] max-w-[400px] overflow-hidden rounded-[0.35rem] bg-surface sm:w-[56vw] md:w-[42vw] lg:w-[34vw] lg:max-w-[400px]">
                <div className="relative aspect-[4/5] w-full">
                  <Image
                    src={item.image}
                    alt={item.title}
                    fill
                    sizes="(min-width: 1024px) 400px, (min-width: 768px) 42vw, 78vw"
                    className="pointer-events-none object-cover [-webkit-user-drag:none]"
                    priority={
                      item.originalIndex === activeIndex &&
                      item.cloneIndex === activeCloneIndex
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

        <div className="flex items-center justify-center gap-6 pt-1 sm:gap-8">
          <button
            type="button"
            onClick={goToPrevious}
            className="inline-flex min-h-11 min-w-11 items-center justify-center font-primary text-sm uppercase tracking-[0.26em] text-foreground-secondary transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
            aria-label="Previous work"
          >
            ←
          </button>
          <button
            type="button"
            onClick={goToNext}
            className="inline-flex min-h-11 min-w-11 items-center justify-center font-primary text-sm uppercase tracking-[0.26em] text-foreground-secondary transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
            aria-label="Next work"
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}
