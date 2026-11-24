"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

export default function SelectedWorkBackground() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setShouldLoad(true);
        observer.disconnect();
      },
      { rootMargin: "400px 0px" },
    );

    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0" aria-hidden="true">
      {shouldLoad ? (
        <Image
          src="/images/background-work.webp"
          alt=""
          fill
          loading="lazy"
          unoptimized
          sizes="100vw"
          className="object-cover object-center opacity-55"
        />
      ) : null}
    </div>
  );
}
