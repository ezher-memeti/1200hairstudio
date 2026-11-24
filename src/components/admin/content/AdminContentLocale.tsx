"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { isLocale, type Locale } from "@/i18n/config";

export const contentLocaleStorageKey = "1200_admin_content_locale";
const Context = createContext<{ locale: Locale; ready: boolean; setLocale: (locale: Locale) => void } | null>(null);

export function AdminContentLocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setValue] = useState<Locale>("de");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try { const saved = localStorage.getItem(contentLocaleStorageKey); if (isLocale(saved)) setValue(saved); } catch { /* Storage may be blocked; keep an in-memory preference. */ }
    setReady(true);
    const sync = (event: StorageEvent) => { if (event.key === contentLocaleStorageKey && isLocale(event.newValue)) setValue(event.newValue); };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  function setLocale(value: Locale) {
    setValue(value);
    try { localStorage.setItem(contentLocaleStorageKey, value); } catch { /* Editing remains available without storage. */ }
  }
  return <Context.Provider value={{ locale, ready, setLocale }}>{children}</Context.Provider>;
}
export function useAdminContentLocale() {
  const value = useContext(Context);
  if (!value) throw new Error("Content editors require AdminContentLocaleProvider.");
  return value;
}
export function ContentEditor({ children }: { children: ReactNode }) {
  const { ready } = useAdminContentLocale();
  return <div style={{ visibility: ready ? "visible" : "hidden" }} aria-busy={!ready}>{children}</div>;
}
export function ContentLanguageSwitcher() {
  const { locale, setLocale, ready } = useAdminContentLocale();
  const t = useTranslations("contentEditor");
  return <div className="my-4 flex min-w-0 flex-wrap items-center gap-3" data-content-language={locale}>
    <span className="text-[10px] uppercase tracking-[.14em] text-foreground-muted">{t("language")}</span>
    <div role="group" aria-label={t("language")} className="inline-flex shrink-0 border border-border">
      {(["en", "de"] as const).map(value => <button key={value} type="button" disabled={!ready} aria-pressed={locale === value} onClick={() => setLocale(value)} className={`min-h-10 min-w-11 px-3 text-xs font-medium tracking-wider outline-none transition-colors focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent ${locale === value ? "bg-accent text-background" : "text-foreground-secondary hover:bg-surface-elevated"}`}>{value.toUpperCase()}</button>)}
    </div>
    <span className="text-xs text-foreground-muted">{t("editing", { language: locale.toUpperCase() })}</span>
  </div>;
}
