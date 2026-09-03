"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "1200-dismissed-announcements";

export function useAnnouncementDismissal(id: string, dismissible: boolean) {
  const [ready, setReady] = useState(!dismissible);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!dismissible) return;
    try {
      const ids = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as unknown;
      setDismissed(Array.isArray(ids) && ids.includes(id));
    } catch {
      setDismissed(false);
    }
    setReady(true);
  }, [dismissible, id]);

  function dismiss() {
    setDismissed(true);
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as unknown;
      const ids = Array.isArray(stored) ? stored.filter((value): value is string => typeof value === "string") : [];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(new Set([...ids, id]))));
    } catch {}
  }

  return { visible: ready && !dismissed, dismiss };
}
