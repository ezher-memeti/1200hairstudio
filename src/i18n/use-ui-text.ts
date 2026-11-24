"use client";
import { useLocale } from "next-intl";
import { useCallback } from "react";
import { textFor } from "./text";
// Render-time labels only: status codes, form values and stored records stay unchanged.
export function useUiText() {
  const locale = useLocale();
  return useCallback(<T,>(value: T): T => typeof value === "string" ? textFor(locale, value) as T : value, [locale]);
}
