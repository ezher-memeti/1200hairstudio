"use client";

import Script from "next/script";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { AnalyticsController, setAnalyticsController, trackEvent } from "@/lib/analytics/client";
import { analyticsPage, type AnalyticsConfig, type ContactAction } from "@/lib/analytics/policy";
import { CONSENT_KEY, PRIVACY_SETTINGS_EVENT, type ConsentDecision } from "@/lib/analytics/consent";
import styles from "./analytics-consent.module.css";

export default function AnalyticsConsent(config: AnalyticsConfig) {
  const t = useTranslations("analytics");
  const { measurementId, production, origin, siteMode } = config;
  const pathname = usePathname();
  const controller = useRef<AnalyticsController | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [decision, setDecision] = useState<ConsentDecision | null>(null);
  const [publicPage, setPublicPage] = useState(false);
  const [open, setOpen] = useState(false);
  const [detailed, setDetailed] = useState(false);
  const [announcement, setAnnouncement] = useState<"acceptedMessage" | "rejectedMessage" | null>(null);
  const editing = useRef(false);
  const dismissed = useRef(false);
  const [loadTag, setLoadTag] = useState(false);
  const [analytics, setAnalytics] = useState(false);

  useEffect(() => {
    const previous = controller.current;
    const current = previous && previous.config.measurementId === measurementId && previous.config.production === production && previous.config.origin === origin && previous.config.siteMode === siteMode ? previous : new AnalyticsController({ measurementId, production, origin, siteMode }, window);
    controller.current = current;
    setAnalyticsController(current);
    const sync = () => {
      setPublicPage(Boolean(analyticsPage(location.href)));
      const permitted = current.sync();
      setDecision(current.consent);
      if (permitted) setLoadTag(true);
    };
    const preferences = () => { editing.current = true; setAnalytics(current.consent?.analytics ?? false); setDetailed(true); setOpen(true); };
    const storage = (event: StorageEvent) => {
      if (event.key !== CONSENT_KEY && event.key !== null) return;
      current.refreshConsent();
      if (!current.consent?.analytics) current.suspend(true);
      sync();
    };
    const click = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest("a,button") : null;
      if (!target || event.defaultPrevented) return;
      const kind = target.getAttribute("data-analytics");
      if (kind === "footer_developer_link") trackEvent("footer_developer_link_click");
      if (kind === "booking_cta") trackEvent("booking_cta_clicked");
      if (kind === "contact" || kind === "instagram") {
        const action = target.getAttribute("data-analytics-contact");
        trackEvent("contact_clicked", ["phone", "maps", "review", "instagram"].includes(action ?? "") ? action as ContactAction : undefined);
        if (kind === "instagram") trackEvent("instagram_clicked");
      }
      if (target instanceof HTMLAnchorElement && target.target !== "_blank" && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
        try { const url = new URL(target.href); if (url.origin === location.origin && !analyticsPage(url.href)) current.suspend(); } catch { /* No tracking of invalid URLs. */ }
      }
    };
    // Update the privacy gate synchronously with history changes, before a loaded
    // tag can observe a private URL. React route effects alone can run too late.
    const push = history.pushState, replace = history.replaceState;
    const pushed: History["pushState"] = function (...args) { current.guardNavigation(new URL(String(args[2] ?? location.href), location.href).href); push.apply(history, args); sync(); };
    const replaced: History["replaceState"] = function (...args) { current.guardNavigation(new URL(String(args[2] ?? location.href), location.href).href); replace.apply(history, args); sync(); };
    history.pushState = pushed; history.replaceState = replaced;
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    window.addEventListener("storage", storage);
    window.addEventListener(PRIVACY_SETTINGS_EVENT, preferences);
    document.addEventListener("click", click, true);
    sync();
    return () => {
      current.suspend(); setAnalyticsController(null);
      if (history.pushState === pushed) history.pushState = push;
      if (history.replaceState === replaced) history.replaceState = replace;
      window.removeEventListener("popstate", sync); window.removeEventListener("hashchange", sync); window.removeEventListener("storage", storage); window.removeEventListener(PRIVACY_SETTINGS_EVENT, preferences); document.removeEventListener("click", click, true);
    };
  // Configuration comes from the server and stays fixed for this deployment.
  }, [measurementId, origin, production, siteMode]);

  useEffect(() => {
    const current = controller.current;
    if (!current) return;
    setPublicPage(Boolean(analyticsPage(location.href)));
    if (current.sync()) setLoadTag(true);
    setDecision(current.consent);
  }, [pathname]);

  useEffect(() => {
    if (!decision) return;
    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
      const remaining = decision.expires - Date.now();
      if (remaining <= 0) { controller.current?.suspend(true); setDecision(null); }
      else timer = setTimeout(check, Math.min(remaining, 2147483647));
    };
    check();
    return () => clearTimeout(timer);
  }, [decision]);

  useEffect(() => {
    if (decision) {
      if (editing.current) setAnalytics(decision.analytics);
      else setOpen(false);
    } else if (publicPage && !dismissed.current && !editing.current) {
      setAnalytics(false);
      setDetailed(false);
      setOpen(true);
    } else if (!publicPage && !editing.current) setOpen(false);
  }, [publicPage, decision]);

  useEffect(() => {
    const modal = dialog.current;
    if (!open || !modal) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    modal.showModal();
    const content = modal.querySelector<HTMLElement>("[data-consent-content]");
    if (content) content.scrollTop = 0;
    modal.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    document.body.style.overflow = "hidden";
    return () => {
      modal.close();
      document.body.style.overflow = previousOverflow;
      const target = opener?.isConnected && opener !== document.body ? opener : document.querySelector<HTMLElement>('header a[href], header button, main a[href], [aria-controls="cookie-preferences"]');
      target?.focus({ preventScroll: true });
    };
  }, [open]);

  const trapFocus = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), summary, [tabindex="0"]')).filter(element => element.getClientRects().length > 0 && (!element.closest('details:not([open])') || element.tagName === "SUMMARY"));
    if (!controls.length) return;
    const index = controls.indexOf(document.activeElement as HTMLElement);
    const next = event.shiftKey ? (index <= 0 ? controls.length - 1 : index - 1) : (index < 0 || index === controls.length - 1 ? 0 : index + 1);
    event.preventDefault();
    controls[next].focus();
  };

  const choose = (allowed: boolean) => {
    const current = controller.current;
    if (!current) return;
    setDecision(current.choose(allowed));
    if (current.sync()) setLoadTag(true);
    editing.current = false;
    dismissed.current = false;
    setAnnouncement(allowed ? "acceptedMessage" : "rejectedMessage");
    setOpen(false);
  };
  const close = () => {
    editing.current = false;
    dismissed.current = true;
    setOpen(false);
  };
  const showDetails = () => {
    editing.current = true;
    setDetailed(true);
    setAnalytics(controller.current?.consent?.analytics ?? false);
  };
  return <>
    {loadTag && <Script id="1200-ga4" src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(config.measurementId)}`} strategy="afterInteractive" onReady={() => controller.current?.tagReady()} />}
    <span role="status" aria-live="polite" className={styles.srOnly}>{announcement ? t(announcement) : ""}</span>
    <dialog id="cookie-preferences" ref={dialog} className={styles.dialog} aria-labelledby="cookie-preferences-title" aria-describedby="cookie-preferences-description" onCancel={close} onKeyDown={trapFocus}>
      <div className={styles.content} data-consent-content>
      <div className={styles.topline}><span>1200 HAIRSTUDIO</span><button type="button" className={styles.close} aria-label={t("close")} onClick={close}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" aria-hidden="true" focusable="false"><path d="m6 6 12 12M18 6 6 18" /></svg></button></div>
      <h2 id="cookie-preferences-title" tabIndex={-1}>{t("title")}</h2>
      <p id="cookie-preferences-description" className={styles.description}>{t("description")}</p>
      {detailed && <div className={styles.options}>
        <label className={styles.option}><span><strong>{t("essential")}</strong><small>{t("essentialDescription")}</small><small className={styles.alwaysActive}>{t("alwaysActive")}</small></span><span className={styles.switchControl}><input type="checkbox" role="switch" checked disabled aria-label={t("essential")} /><span className={styles.switch} aria-hidden="true" /></span></label>
        <label className={styles.option}><span><strong>{t("optional")}</strong><small>{t("analyticsDescription")}</small></span><span className={styles.switchControl}><input type="checkbox" role="switch" checked={analytics} onChange={event => setAnalytics(event.target.checked)} aria-label={t("optional")} /><span className={styles.switch} aria-hidden="true" /></span></label>
      </div>}
      <details className={styles.notice}><summary>{t("policy")}</summary><p>{t("policyBody")}</p><p>{t("cookiesBody")}</p><p><a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">{t("googlePolicy")}</a></p></details>
      {config.siteMode === "live" && <Link className={styles.policyLink} href="/privacy" onClick={close}>{t("fullPolicy")}</Link>}
      </div>
      <div className={styles.decisionActions}>
      <div className={styles.actions}><button type="button" onClick={() => choose(true)}>{t("accept")}</button><button type="button" onClick={() => choose(false)}>{t("reject")}</button></div>
      {detailed ? <button type="button" className={styles.save} onClick={() => choose(analytics)}>{t("save")}</button> : <button type="button" className={styles.preferences} onClick={showDetails}>{t("preferences")}</button>}
      </div>
    </dialog>
  </>;
}
