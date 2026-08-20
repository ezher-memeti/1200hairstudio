"use client";

import { useMemo, useState } from "react";
import CircularGallery, {
  type WorkItem,
} from "@/components/home/CircularGallery";

const works: WorkItem[] = [
  {
    id: "01",
    title: "Textured Fade",
    category: "Hair",
    duration: "30–60 MIN",
    image: "/images/hair.jpeg",
  },
  {
    id: "02",
    title: "Low Fade",
    category: "Hair",
    duration: "30 MIN",
    image: "/images/kid.jpeg",
  },
  {
    id: "04",
    title: "Hair + Beard",
    category: "Hair + Beard",
    duration: "45–60 MIN",
    image: "/images/hair-beard.jpeg",
  },
  {
    id: "05",
    title: "Skin Fade",
    category: "Hair",
    duration: "30–60 MIN",
    image: "/images/hair.jpeg",
  },
];

export default function SelectedWork() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [hasInteracted, setHasInteracted] = useState(false);

  const interactionHint = useMemo(() => {
    return hasInteracted
      ? "opacity-35"
      : "opacity-100";
  }, [hasInteracted]);

  return (
    <section id="work" className="relative overflow-hidden bg-background">
      <div
        className="pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat opacity-55"
        style={{
          backgroundImage:
            "url('/images/background-work.PNG')",
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(8,8,8,0.78)_0%,rgba(8,8,8,0.68)_42%,rgba(8,8,8,0.82)_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(8,8,8,0.22)_0%,rgba(8,8,8,0.5)_58%,rgba(8,8,8,0.74)_100%)]" />

      <div className="page-container relative z-10 py-8 sm:py-10 lg:py-12">
        <div className="space-y-4">
          <p className="font-primary text-xs uppercase tracking-[0.34em] text-foreground-secondary">
            04 / Selected Work
          </p>
          <h2 className="font-display max-w-lg text-[clamp(2.2rem,6vw,4.5rem)] font-semibold uppercase leading-[0.95] tracking-[-0.04em] text-foreground">
            Selected
            <br />
            Work.
          </h2>
          <p className="font-primary max-w-md text-sm leading-7 text-foreground-secondary sm:text-base">
            A selection of cuts from the chair.
          </p>
        </div>

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
            <span className="hidden sm:inline">
              Swipe or scroll ↔
            </span>
            <span className="sm:hidden">
              Swipe to explore
            </span>
          </p>
        </div>
      </div>
    </section>
  );
}
