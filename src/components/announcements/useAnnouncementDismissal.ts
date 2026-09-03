"use client";

import { useCallback, useState } from "react";

export function useAnnouncementDismissal(id: string, dismissible: boolean) {
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const dismiss = useCallback(() => {
    if (dismissible && id) setDismissedId(id);
  }, [dismissible, id]);

  return { visible: !dismissible || dismissedId !== id, dismiss };
}
