"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useRef, useState } from "react";

type ScrollVideoSectionProps = { children: ReactNode };
type PositionPoint = { width: number; focusX: number; translateX: number };

const FRAME_COUNT = 228;
const MAX_CONCURRENT_LOADS = 4;
const INITIAL_PREFETCH_AHEAD = 6;
const PREFETCH_AHEAD = 18;
const PREFETCH_BEHIND = 8;
const MAX_DECODED_FRAMES = 72;
const MAX_DPR = 2;
const ScrollVideoProgressContext = createContext(0);
const POSITION_POINTS: PositionPoint[] = [
  { width: 320, focusX: 0.78, translateX: 0.14 },
  { width: 390, focusX: 0.5, translateX: 0 },
  { width: 768, focusX: 0.5, translateX: 0.01 },
  { width: 1024, focusX: 0.64, translateX: 0.16 },
  { width: 1280, focusX: 0.62, translateX: 0.19 },
  { width: 1536, focusX: 0.6, translateX: 0.2 },
];

function getFrameSrc(index: number) {
  return `/frames/barber-chair/webp60/frame-${String(index + 1).padStart(4, "0")}.webp`;
}

function interpolatePosition(viewportWidth: number) {
  if (viewportWidth <= POSITION_POINTS[0].width) return POSITION_POINTS[0];
  const last = POSITION_POINTS[POSITION_POINTS.length - 1];
  if (viewportWidth >= last.width) return last;
  for (let index = 1; index < POSITION_POINTS.length; index += 1) {
    const right = POSITION_POINTS[index];
    if (viewportWidth > right.width) continue;
    const left = POSITION_POINTS[index - 1];
    const ratio = (viewportWidth - left.width) / (right.width - left.width);
    return { width: viewportWidth, focusX: left.focusX + (right.focusX - left.focusX) * ratio, translateX: left.translateX + (right.translateX - left.translateX) * ratio };
  }
  return last;
}

function getObjectCoverRect(imageWidth: number, imageHeight: number, canvasWidth: number, canvasHeight: number, viewportWidth: number) {
  const scale = Math.max(canvasWidth / imageWidth, canvasHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  const position = interpolatePosition(viewportWidth);
  return { x: (canvasWidth - width) * position.focusX + position.translateX * canvasWidth, y: (canvasHeight - height) / 2, width, height };
}

function findNearestLoadedFrame(images: Array<HTMLImageElement | null>, requestedIndex: number) {
  if (images[requestedIndex]?.complete && images[requestedIndex]?.naturalWidth) return requestedIndex;
  for (let distance = 1; distance < FRAME_COUNT; distance += 1) {
    const before = requestedIndex - distance;
    const after = requestedIndex + distance;
    if (before >= 0 && images[before]?.complete && images[before]?.naturalWidth) return before;
    if (after < FRAME_COUNT && images[after]?.complete && images[after]?.naturalWidth) return after;
  }
  return null;
}

export function useScrollVideoProgress() {
  return useContext(ScrollVideoProgressContext);
}

export default function ScrollVideoSection({ children }: ScrollVideoSectionProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const posterRef = useRef<HTMLImageElement | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);
  const imagesRef = useRef<Array<HTMLImageElement | null>>(Array(FRAME_COUNT).fill(null));
  const loadingRef = useRef(new Set<number>());
  const queuedRef = useRef<number[]>([]);
  const queuedIndexesRef = useRef(new Set<number>());
  const activeLoadsRef = useRef(0);
  const hasScrollInputRef = useRef(false);
  const animationFrameRef = useRef<number | null>(null);
  const currentFrameRef = useRef(-1);
  const requestedFrameRef = useRef(0);
  const reactProgressRef = useRef(0);
  const activeRef = useRef(true);
  const mountedRef = useRef(false);
  const reducedMotionRef = useRef(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const section = sectionRef.current;
    if (!canvas || !section) return;
    const loadedImages = imagesRef.current;
    const loadingIndexes = loadingRef.current;
    const queuedIndexes = queuedIndexesRef.current;
    mountedRef.current = true;
    reducedMotionRef.current = false;

    const drawFrame = (requestedIndex: number, force = false) => {
      if (!mountedRef.current || (!activeRef.current && !force)) return;
      const index = findNearestLoadedFrame(imagesRef.current, requestedIndex);
      if (index === null || (!force && index === currentFrameRef.current)) return;
      const image = imagesRef.current[index];
      const context = canvas.getContext("2d", { alpha: false });
      if (!image || !context || !image.naturalWidth || !image.naturalHeight) return;
      const rect = getObjectCoverRect(image.naturalWidth, image.naturalHeight, canvas.width, canvas.height, window.innerWidth);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, rect.x, rect.y, rect.width, rect.height);
      currentFrameRef.current = index;
    };

    const pruneDecodedFrames = (targetIndex: number) => {
      const loaded = imagesRef.current
        .map((image, index) => ({ image, index }))
        .filter(({ image }) => image?.complete && image.naturalWidth);
      if (loaded.length <= MAX_DECODED_FRAMES) return;
      const keep = new Set(
        loaded
          .sort((left, right) => Math.abs(left.index - targetIndex) - Math.abs(right.index - targetIndex))
          .slice(0, MAX_DECODED_FRAMES)
          .map(({ index }) => index),
      );
      keep.add(0);
      for (const { image, index } of loaded) {
        if (keep.has(index) || !image || image === posterRef.current) continue;
        image.onload = null;
        image.onerror = null;
        image.src = "";
        imagesRef.current[index] = null;
      }
    };

    const startQueuedLoads = () => {
      while (mountedRef.current && activeRef.current && activeLoadsRef.current < MAX_CONCURRENT_LOADS) {
        const index = queuedRef.current.shift();
        if (index === undefined) return;
        queuedIndexesRef.current.delete(index);
        if (imagesRef.current[index] || loadingRef.current.has(index)) continue;
        loadingRef.current.add(index);
        activeLoadsRef.current += 1;
        const image = new window.Image();
        image.decoding = "async";
        image.onload = () => {
          if (mountedRef.current) {
            imagesRef.current[index] = image;
            if (index === requestedFrameRef.current || currentFrameRef.current < 0) drawFrame(requestedFrameRef.current, true);
            pruneDecodedFrames(requestedFrameRef.current);
          }
          loadingRef.current.delete(index);
          activeLoadsRef.current -= 1;
          startQueuedLoads();
        };
        image.onerror = () => {
          loadingRef.current.delete(index);
          activeLoadsRef.current -= 1;
          startQueuedLoads();
        };
        image.src = getFrameSrc(index);
      }
    };

    const prioritizeFrames = (targetIndex: number, previousIndex: number) => {
      queuedRef.current = [];
      queuedIndexesRef.current.clear();
      const direction = targetIndex >= previousIndex ? 1 : -1;
      const candidates = [targetIndex];
      const prefetchAhead = hasScrollInputRef.current ? PREFETCH_AHEAD : INITIAL_PREFETCH_AHEAD;
      const prefetchBehind = hasScrollInputRef.current ? PREFETCH_BEHIND : 0;
      for (let distance = 1; distance <= prefetchAhead; distance += 1) {
        candidates.push(targetIndex + distance * direction);
        if (distance <= prefetchBehind) candidates.push(targetIndex - distance * direction);
      }
      for (const index of candidates) {
        if (index === 0 || index < 0 || index >= FRAME_COUNT || imagesRef.current[index] || loadingRef.current.has(index) || queuedIndexesRef.current.has(index)) continue;
        queuedRef.current.push(index);
        queuedIndexesRef.current.add(index);
      }
      startQueuedLoads();
    };

    const resizeCanvas = () => {
      const bounds = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const width = Math.max(1, Math.round(bounds.width * dpr));
      const height = Math.max(1, Math.round(bounds.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        currentFrameRef.current = -1;
      }
      drawFrame(requestedFrameRef.current, true);
    };

    const updateFromScroll = () => {
      animationFrameRef.current = null;
      const rect = section.getBoundingClientRect();
      const scrollableDistance = section.offsetHeight - window.innerHeight;
      if (scrollableDistance <= 0) return;
      const nextProgress = Math.min(Math.max(-rect.top / scrollableDistance, 0), 1);
      const frameIndex = reducedMotionRef.current ? 0 : Math.min(FRAME_COUNT - 1, Math.round(nextProgress * (FRAME_COUNT - 1)));
      const previousIndex = requestedFrameRef.current;
      requestedFrameRef.current = frameIndex;
      prioritizeFrames(frameIndex, previousIndex);
      drawFrame(frameIndex);
      const reactProgress = Math.round(nextProgress * 200) / 200;
      if (reactProgress !== reactProgressRef.current) {
        reactProgressRef.current = reactProgress;
        setProgress(reactProgress);
      }
    };

    const scheduleUpdate = () => {
      if (animationFrameRef.current !== null) return;
      animationFrameRef.current = requestAnimationFrame(updateFromScroll);
    };

    const handleScroll = () => {
      hasScrollInputRef.current = true;
      scheduleUpdate();
    };

    const observer = new IntersectionObserver(([entry]) => {
      activeRef.current = entry.isIntersecting;
      if (entry.isIntersecting) {
        resizeCanvas();
        prioritizeFrames(requestedFrameRef.current, requestedFrameRef.current);
      }
      scheduleUpdate();
    }, { rootMargin: "100% 0px" });

    observer.observe(section);
    const poster = posterRef.current;
    const syncPosterFrame = () => {
      if (!poster?.complete || !poster.naturalWidth) return;
      imagesRef.current[0] = poster;
      resizeCanvas();
      scheduleUpdate();
    };
    syncPosterFrame();
    poster?.addEventListener("load", syncPosterFrame);
    prioritizeFrames(0, 0);
    updateFromScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", resizeCanvas, { passive: true });
    window.addEventListener("orientationchange", resizeCanvas, { passive: true });

    return () => {
      mountedRef.current = false;
      observer.disconnect();
      if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
      poster?.removeEventListener("load", syncPosterFrame);
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", resizeCanvas);
      window.removeEventListener("orientationchange", resizeCanvas);
      loadedImages.forEach((image) => { if (image) { image.onload = null; image.onerror = null; } });
      loadingIndexes.clear();
      queuedRef.current = [];
      queuedIndexes.clear();
    };
  }, []);

  return (
    <section ref={sectionRef} className="relative bg-background">
      <div className="sticky top-0 h-screen overflow-hidden">
        <div className="relative h-full w-full">
          <Image
            ref={posterRef}
            src={getFrameSrc(0)}
            alt=""
            fill
            priority
            decoding="sync"
            unoptimized
            sizes="100vw"
            className="pointer-events-none z-0 object-cover object-center max-[389px]:translate-x-[14vw] max-[389px]:object-[78%_center] md:translate-x-[1vw] lg:translate-x-[16vw] lg:object-[64%_center] xl:translate-x-[19vw] xl:object-[62%_center] 2xl:translate-x-[20vw] 2xl:object-[60%_center]"
            aria-hidden="true"
          />
          <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-10 h-full w-full" aria-hidden="true" />
          <div className="pointer-events-none absolute inset-0 z-20 bg-[linear-gradient(to_right,rgba(13,13,13,1)_0%,rgba(13,13,13,0.96)_16%,rgba(13,13,13,0.82)_34%,rgba(13,13,13,0.56)_52%,rgba(13,13,13,0.26)_72%,rgba(13,13,13,0.08)_88%,rgba(13,13,13,0)_100%)] sm:bg-[linear-gradient(to_right,rgba(13,13,13,0.98)_0%,rgba(13,13,13,0.9)_18%,rgba(13,13,13,0.72)_36%,rgba(13,13,13,0.44)_56%,rgba(13,13,13,0.18)_78%,rgba(13,13,13,0.04)_100%)] lg:bg-[linear-gradient(to_right,rgba(13,13,13,0.98)_0%,rgba(13,13,13,0.9)_20%,rgba(13,13,13,0.7)_40%,rgba(13,13,13,0.4)_60%,rgba(13,13,13,0.14)_82%,rgba(13,13,13,0.02)_100%)]" />
        </div>
      </div>
      <ScrollVideoProgressContext.Provider value={progress}>
        <div className="relative z-10 mt-[-100vh]">{children}</div>
      </ScrollVideoProgressContext.Provider>
    </section>
  );
}
