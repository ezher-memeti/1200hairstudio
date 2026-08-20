"use client";

import type { ReactNode } from "react";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

type ScrollVideoSectionProps = {
  children: ReactNode;
};

const ScrollVideoProgressContext = createContext(0);

export function useScrollVideoProgress() {
  return useContext(ScrollVideoProgressContext);
}

export default function ScrollVideoSection({
  children,
}: ScrollVideoSectionProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);

  const frameRef = useRef<number | null>(null);
  const durationRef = useRef(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    const section = sectionRef.current;

    if (!video || !section) return;

    const updateVideo = () => {
      frameRef.current = null;

      if (!durationRef.current) return;

      const rect = section.getBoundingClientRect();

      const scrollableDistance =
        section.offsetHeight - window.innerHeight;

      if (scrollableDistance <= 0) return;

      const progress = Math.min(
        Math.max(-rect.top / scrollableDistance, 0),
        1
      );

      setProgress(progress);

      const targetTime =
        progress * durationRef.current;

      if (
        Math.abs(video.currentTime - targetTime) >
        0.016
      ) {
        video.currentTime = targetTime;
      }
    };

    const handleScroll = () => {
      if (frameRef.current !== null) return;

      frameRef.current =
        requestAnimationFrame(updateVideo);
    };

    const handleLoadedMetadata = () => {
      durationRef.current = video.duration;

      video.pause();

      // Helps force the first frame to render
      video.currentTime = 0.001;

      updateVideo();
    };

    if (video.readyState >= 1) {
      handleLoadedMetadata();
    } else {
      video.addEventListener(
        "loadedmetadata",
        handleLoadedMetadata
      );
    }

    window.addEventListener("scroll", handleScroll, {
      passive: true,
    });

    window.addEventListener("resize", handleScroll);

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }

      window.removeEventListener(
        "scroll",
        handleScroll
      );

      window.removeEventListener(
        "resize",
        handleScroll
      );

      video.removeEventListener(
        "loadedmetadata",
        handleLoadedMetadata
      );
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative bg-background"
    >
      {/* Sticky video background */}
      <div className="sticky top-0 h-screen overflow-hidden">
        <video
          ref={videoRef}
          className="pointer-events-none h-full w-full translate-x-[14%] object-cover object-[78%_center] min-[390px]:translate-x-0 min-[390px]:object-[50%_center] sm:translate-x-[0%] sm:object-[50%_center] md:translate-x-[1%] md:object-[50%_center] lg:translate-x-[16%] lg:object-[64%_center] xl:translate-x-[19%] xl:object-[62%_center] 2xl:translate-x-[20%] 2xl:object-[60%_center]"
          muted
          playsInline
          preload="auto"
          aria-hidden="true"
          src="/videos/barber-chair-scroll.mp4"
        />

        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(13,13,13,1)_0%,rgba(13,13,13,0.96)_16%,rgba(13,13,13,0.82)_34%,rgba(13,13,13,0.56)_52%,rgba(13,13,13,0.26)_72%,rgba(13,13,13,0.08)_88%,rgba(13,13,13,0)_100%)] sm:bg-[linear-gradient(to_right,rgba(13,13,13,0.98)_0%,rgba(13,13,13,0.9)_18%,rgba(13,13,13,0.72)_36%,rgba(13,13,13,0.44)_56%,rgba(13,13,13,0.18)_78%,rgba(13,13,13,0.04)_100%)] lg:bg-[linear-gradient(to_right,rgba(13,13,13,0.98)_0%,rgba(13,13,13,0.9)_20%,rgba(13,13,13,0.7)_40%,rgba(13,13,13,0.4)_60%,rgba(13,13,13,0.14)_82%,rgba(13,13,13,0.02)_100%)]" />
      </div>

      {/* Content sits over the video */}
      <ScrollVideoProgressContext.Provider value={progress}>
        <div className="relative z-10 mt-[-100vh]">
          {children}
        </div>
      </ScrollVideoProgressContext.Provider>
    </section>
  );
}
