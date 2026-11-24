"use client";
import { useEffect, useState } from "react";
import { calendarTodayInZurich } from "@/lib/calendar/date-policy";
import { getUtcIsoForZurichDateTime } from "@/lib/appointments/availability";

export function useCalendarToday(initialDate?: string) {
  const [today, setToday] = useState(initialDate ?? calendarTodayInZurich);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      clearTimeout(timer);
      const now = new Date();
      const date = calendarTodayInZurich(now);
      setToday(date);
      const next = new Date(date + "T12:00:00Z");
      next.setUTCDate(next.getUTCDate() + 1);
      const midnight = getUtcIsoForZurichDateTime(
        next.toISOString().slice(0, 10),
        "00:00",
      );
      timer = setTimeout(
        update,
        Math.max(1, Date.parse(midnight) - now.getTime() + 1),
      );
    };
    update();
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return today;
}
