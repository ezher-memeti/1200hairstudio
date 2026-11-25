"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { DEFAULT_PUSH_PREFERENCES, type PushPreferences } from "@/lib/push/preferences";
import { disableCurrentPush, needsHomeScreen, pushRegistration, pushRenewalEnabled, pushRequest, rememberPushDevice, storedPushDevice, supportsPush, vapidBytes } from "@/lib/push/client";
const button = "min-h-11 border border-border px-4 py-3 text-xs text-foreground transition-colors hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40";
export default function PushNotifications({ preferences = DEFAULT_PUSH_PREFERENCES, onChange }: { preferences?: PushPreferences; onChange: (preferences: PushPreferences) => void }) {
  const t = useTranslations("push"), locale = useLocale();
  const [permission, setPermission] = useState<string>("checking"), [active, setActive] = useState(false), [busy, setBusy] = useState(false), [configured, setConfigured] = useState(false), [notice, setNotice] = useState("");
  const [hasSubscription, setHasSubscription] = useState(false);
  const reconciling = useRef<Promise<void> | null>(null);
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";
  const explain = useCallback((error: unknown) => {
    const code = error instanceof Error ? error.message : "request_failed";
    return ["not_configured", "test_limited_or_inactive", "worker_conflict", "key_changed", "unauthenticated", "forbidden", "queue_unavailable", "subscription_unavailable"].includes(code) ? code : "request_failed";
  }, []);
  const reconcile = useCallback(async (create: boolean) => {
    if (reconciling.current) { await reconciling.current; if (!create) return; }
    const sync = async () => {
    const status = await pushRequest("subscriptions");
    setConfigured(Boolean(status.configured && publicKey));
    if (!status.configured || !publicKey) { if (create) throw new Error("not_configured");return; }
    const registration = await pushRegistration();
    let subscription = await registration.pushManager.getSubscription();
    setHasSubscription(Boolean(subscription));
    if (subscription?.options.applicationServerKey && Array.from(new Uint8Array(subscription.options.applicationServerKey)).join(",") !== Array.from(vapidBytes(publicKey)).join(",")) throw new Error("key_changed");
    const device = status.devices.find((item: { id: string; active: boolean }) => item.id === storedPushDevice());
    if (subscription && device && !device.active && pushRenewalEnabled()) { await subscription.unsubscribe();subscription = null; }
    if (!subscription && (create || pushRenewalEnabled()) && Notification.permission === "granted") {
      subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidBytes(publicKey) });
    }
    if (!subscription) { setActive(false);return; }
    const saved = await pushRequest("subscriptions", "POST", { subscription: subscription.toJSON(), locale, replaceId: storedPushDevice() });
    rememberPushDevice(saved.id);setActive(true);setHasSubscription(true);
    };
    const pending = sync();
    reconciling.current = pending;
    try { await pending; } finally { if (reconciling.current === pending) reconciling.current = null; }
  }, [locale, publicKey]);
  useEffect(() => {
    let mounted = true;
    const sync = async () => {
      if (!mounted) return;
      if (needsHomeScreen()) { setPermission("homeScreen");return; }
      if (!supportsPush()) { setPermission("unsupported");return; }
      setPermission(Notification.permission);
      try {
        if (Notification.permission === "granted") await reconcile(false);
        else { const status = await pushRequest("subscriptions");if (mounted) setConfigured(Boolean(status.configured && publicKey)); }
      } catch (error) { if (mounted) setNotice(explain(error)); }
    };
    void sync();
    const message = (event: MessageEvent) => { if (event.data?.type === "PUSH_SUBSCRIPTION_CHANGED") void sync(); };
    navigator.serviceWorker?.addEventListener("message", message);
    window.addEventListener("focus", sync);
    return () => { mounted = false;navigator.serviceWorker?.removeEventListener("message", message);window.removeEventListener("focus", sync); };
  }, [reconcile, explain, publicKey]);
  async function enable() {
    if (busy || !supportsPush() || needsHomeScreen()) return;
    // The permission call is directly in the click, before any asynchronous work.
    const permissionRequest = Notification.permission === "default" ? Notification.requestPermission() : Promise.resolve(Notification.permission);
    setBusy(true);setNotice("");
    try { const result = await permissionRequest;setPermission(result);if (result === "granted") { await reconcile(true);setNotice("enabled"); } else setNotice("denied"); }
    catch (error) { setNotice(explain(error)); } finally { setBusy(false); }
  }
  async function disable() { setBusy(true);try { await disableCurrentPush();setActive(false);setHasSubscription(false);setNotice("disabled"); } catch (error) { setNotice(explain(error)); } finally { setBusy(false); } }
  async function test() {
    const id = storedPushDevice();if (!id) return;setBusy(true);
    try { const result = await pushRequest("test", "POST", { id });setNotice(result.accepted ? "test_accepted" : result.uncertain ? "test_uncertain" : result.retrying || !result.processed ? "test_queued" : "test_failed"); }
    catch (error) { setNotice(explain(error)); } finally { setBusy(false); }
  }
  return <section className="mt-8 border border-border bg-background/40 p-4 sm:p-5" aria-labelledby="push-heading">
    <h3 id="push-heading" className="font-admin-display text-xl text-foreground">{t("heading")}</h3>
    <p className="mt-2 text-sm leading-6 text-foreground-secondary">{t("description")}</p>
    <p className="mt-4 text-xs text-foreground-muted" role="status">{t("permission_label")}: {t(["granted", "denied", "default", "unsupported", "homeScreen"].includes(permission) ? permission as "granted" | "denied" | "default" | "unsupported" | "homeScreen" : "checking")} · {t(active ? "device_active" : "device_inactive")}</p>
    <div className="mt-4 flex flex-wrap gap-3">
      <button type="button" className={button} disabled={busy || !configured || ["unsupported", "homeScreen", "denied", "checking"].includes(permission)} onClick={enable}>{t("enable")}</button>
      <button type="button" className={button} disabled={busy || !active} onClick={test}>{t("send_test")}</button>
      <button type="button" className={button} disabled={busy || (!active && !hasSubscription)} onClick={disable}>{t("disable")}</button>
    </div>
    {!configured && !["checking", "unsupported", "homeScreen"].includes(permission) ? <p className="mt-3 text-xs text-foreground-muted">{t("not_configured")}</p> : null}
    <div className="mt-5 divide-y divide-border">{(["newCustomers", "newAppointments", "completed", "adminBookings"] as const).map(key => <label key={key} className="flex min-h-14 items-center justify-between gap-4 py-3 text-sm text-foreground"><span>{t(key)}</span><input type="checkbox" role="switch" className="size-5 shrink-0 accent-[#b99a76]" checked={preferences[key]} onChange={event => onChange({ ...preferences, [key]: event.target.checked })} /></label>)}</div>
    <p className="mt-3 text-xs text-foreground-muted">{t("save_preferences")}</p>
    <p className="mt-3 text-sm leading-6 text-foreground-secondary" aria-live="polite">{notice ? t(notice as "enabled") : ""}</p>
  </section>;
}
