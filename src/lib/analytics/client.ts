"use client";
import { analyticsEnabled, analyticsPage, type AnalyticsConfig, type AnalyticsEvent, type ContactAction } from "./policy";
import { clearAnalyticsStorage, COMPLETIONS_KEY, CONSENT_KEY, CONSENT_LIFETIME, CONSENT_POLICY_VERSION, FLOW_KEY, readConsent, type ConsentDecision } from "./consent";

declare global { interface Window { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void } }
const denied = { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" };
const contacts: ContactAction[] = ["phone", "maps", "review", "instagram"];
const events: AnalyticsEvent[] = ["booking_started", "service_selected", "booking_completed", "booking_cta_clicked", "contact_clicked", "instagram_clicked", "footer_developer_link_click"];

export class AnalyticsController {
  private decision: ConsentDecision | null = null;
  private volatileDecision = false;
  private booted = false;
  private ready = false;
  private lastPage: string | null = null;
  private previousPage = "";
  private pending: Array<[AnalyticsEvent, Record<string, string>]> = [];
  private memoryFlowStarted = false;
  constructor(readonly config: AnalyticsConfig, private win: Window) {
    this.refreshConsent();
    this.disable(true);
  }
  private disable(value: boolean) { try { (this.win as unknown as Record<string, unknown>)[`ga-disable-${this.config.measurementId}`] = value; } catch { /* Analytics is optional. */ } }
  private send(...args: unknown[]) { try { this.win.gtag?.(...args); } catch { /* A tag failure must never interrupt the application. */ } }
  refreshConsent() {
    try { this.decision = readConsent(this.win.localStorage); } catch { this.decision = null; }
  }
  get consent() { return this.decision && this.decision.expires > Date.now() ? this.decision : null; }
  eligible() { return analyticsEnabled(this.config, this.win.location.href); }
  permitted() {
    if (!this.volatileDecision) this.refreshConsent();
    return this.eligible() && this.decision?.analytics === true && this.decision.expires > Date.now();
  }
  choose(analytics: boolean) {
    const decidedAt = Date.now();
    this.decision = { version: 1, status: analytics ? "accepted" : "rejected", analytics, decidedAt, policyVersion: CONSENT_POLICY_VERSION, expires: decidedAt + CONSENT_LIFETIME };
    try { this.win.localStorage.setItem(CONSENT_KEY, JSON.stringify(this.decision)); this.volatileDecision = false; } catch { this.volatileDecision = true; }
    if (!analytics) this.suspend(true);
    return this.decision;
  }
  guardNavigation(href: string) {
    if (!analyticsEnabled(this.config, href)) this.suspend();
    else this.disable(true);
  }
  suspend(withdraw = false) {
    this.disable(true); this.pending = []; this.lastPage = null;
    if (withdraw) {
      if (this.booted) this.send("consent", "update", denied);
      clearAnalyticsStorage(this.win);
      this.memoryFlowStarted = false;
    }
  }
  private context() {
    const page = analyticsPage(this.win.location.href)!;
    const modePath = this.config.siteMode === "live" ? page.path : `/${page.locale}/${this.config.siteMode === "coming_soon" ? "coming-soon" : "under-construction"}`;
    return { page_path: modePath, page_location: this.config.origin + modePath, page_title: this.config.siteMode === "live" ? page.title : `1200 HAIRSTUDIO | ${this.config.siteMode === "coming_soon" ? "Coming Soon" : "Under Construction"}`, page_referrer: this.previousPage, language: page.locale === "de" ? "de-CH" : "en", site_mode: this.config.siteMode };
  }
  /** Call before rendering next/script. No tag, cookies or pings exist pre-opt-in. */
  sync() {
    try {
      if (!this.permitted()) { this.suspend(); return false; }
      this.disable(false);
      if (!this.booted) {
        this.win.dataLayer ??= [];
        const win = this.win;
        win.gtag ??= function (..._args: unknown[]) { win.dataLayer!.push(arguments); };
        win.gtag("consent", "default", denied);
        win.gtag("set", { ads_data_redaction: true, url_passthrough: false, allow_google_signals: false, allow_ad_personalization_signals: false, send_page_view: false });
        win.gtag("js", new Date());
        win.gtag("consent", "update", { ...denied, analytics_storage: "granted" });
        win.gtag("config", this.config.measurementId, { ...this.context(), send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false, cookie_expires: CONSENT_LIFETIME / 1000, cookie_update: false, cookie_flags: "SameSite=Lax;Secure" });
        this.booted = true;
      } else {
        this.send("consent", "update", { ...denied, analytics_storage: "granted" });
      }
      this.send("set", this.context());
      if (this.ready) this.pageView();
      return true;
    } catch { this.disable(true); return false; }
  }
  tagReady() {
    this.ready = true;
    if (!this.permitted()) { this.suspend(); return; }
    this.pageView();
    for (const [name, parameters] of this.pending.splice(0)) this.send("event", name, parameters);
  }
  private pageView() {
    if (!this.permitted()) return;
    const context = this.context();
    if (this.lastPage === context.page_path) return;
    this.send("event", "page_view", { ...context, send_to: this.config.measurementId });
    this.lastPage = context.page_path;
    this.previousPage = context.page_location;
  }
  event(name: AnalyticsEvent, action?: ContactAction) {
    try {
      if (!events.includes(name) || !this.permitted() || (this.config.siteMode !== "live" && name.startsWith("booking")) || (this.config.siteMode !== "live" && name === "service_selected")) return false;
      const parameters = { ...this.context(), send_to: this.config.measurementId, ...(name === "footer_developer_link_click" ? { link_location: "footer", link_destination: "linkedin" } : {}), ...(name === "contact_clicked" && action && contacts.includes(action) ? { contact_action: action } : {}) };
      if (this.ready) this.send("event", name, parameters);
      else {
        if (this.pending.length >= 30) return false;
        this.pending.push([name, parameters]);
      }
      return true;
    } catch { return false; }
  }
  startBooking() {
    try {
      if (!this.permitted() || this.config.siteMode !== "live") return;
      if (this.memoryFlowStarted || this.win.sessionStorage.getItem(FLOW_KEY)) return;
      if (this.event("booking_started")) { this.memoryFlowStarted = true; this.win.sessionStorage.setItem(FLOW_KEY, "1"); }
    } catch { /* Tracking must never affect booking. */ }
  }
  resetBooking() {
    this.memoryFlowStarted = false;
    try { this.win.sessionStorage.removeItem(FLOW_KEY); } catch { /* Optional storage. */ }
  }
  async completed(reference: string | null | undefined) {
    try {
      if (!reference || !this.permitted() || this.config.siteMode !== "live") return false;
      // A private reference is hashed only for a local duplicate marker. Neither
      // the reference nor its hash is ever passed to Google or to dataLayer.
      const digest = await this.win.crypto.subtle.digest("SHA-256", new TextEncoder().encode(reference));
      const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
      if (!this.permitted()) return false;
      const now = Date.now();
      const raw: unknown = JSON.parse(this.win.localStorage.getItem(COMPLETIONS_KEY) ?? "[]");
      if (!Array.isArray(raw)) return false;
      const seen: Array<{ hash: string; at: number }> = raw.filter(item => item && typeof item.hash === "string" && Number.isFinite(item.at) && item.at > now - CONSENT_LIFETIME);
      if (seen.some(item => item.hash === hash)) return false;
      this.win.localStorage.setItem(COMPLETIONS_KEY, JSON.stringify([...seen.slice(-499), { hash, at: now }]));
      const accepted = this.event("booking_completed");
      if (accepted) this.resetBooking();
      return accepted;
    } catch { return false; } // Fail closed if durable deduplication is unavailable.
  }
}
let active: AnalyticsController | null = null;
export function setAnalyticsController(controller: AnalyticsController | null) { active = controller; }
export function trackEvent(name: Exclude<AnalyticsEvent, "booking_completed" | "booking_started">, action?: ContactAction) {
  try {
    if (!["service_selected", "booking_cta_clicked", "contact_clicked", "instagram_clicked", "footer_developer_link_click"].includes(name)) return false;
    return active?.event(name, action) ?? false;
  } catch { return false; }
}
export function bookingStarted() { try { active?.startBooking(); } catch { /* Non-blocking. */ } }
export function resetBookingAnalytics() { try { active?.resetBooking(); } catch { /* Non-blocking. */ } }
export function bookingCompleted(reference: string | null | undefined) { void active?.completed(reference).catch(() => false); }
