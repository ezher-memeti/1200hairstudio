"use client";

import { useMemo, useState } from "react";
import CircularGallery, { type WorkItem } from "@/components/home/CircularGallery";

type SelectedWorkClientProps = {
  works: WorkItem[];
};

export default function SelectedWorkClient({
  works,
}: SelectedWorkClientProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [hasInteracted, setHasInteracted] = useState(false);

  const interactionHint = useMemo(() => {
    return hasInteracted ? "opacity-35" : "opacity-100";
  }, [hasInteracted]);

  return (
    <>
      <div className="pt-8 sm:pt-10">
        <CircularGallery
          items={works}
          activeIndex={activeIndex}
          onActiveIndexChange={setActiveIndex}
          onInteracted={() => setHasInteracted(true)}
        />
      </div>

      <div className="pt-3 text-center sm:pt-4">
        <p
          className={`font-primary text-xs uppercase tracking-[0.34em] text-foreground-muted transition-opacity duration-300 ${interactionHint}`}
        >
          <span className="hidden sm:inline">Swipe or scroll ↔</span>
          <span className="sm:hidden">Swipe to explore</span>
        </p>
      </div>
    </>
  );
}
