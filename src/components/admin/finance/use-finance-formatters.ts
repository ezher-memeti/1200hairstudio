"use client";
import { useLocale } from "next-intl";
import { displayDate, formatMoney } from "./shared";
export function useFinanceFormatters() {
  const locale = useLocale();
  return { locale, formatMoney: (value: number) => formatMoney(value, locale), displayDate: (value: string) => displayDate(value, locale) };
}
