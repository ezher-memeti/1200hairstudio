"use client";
const DEVICE_KEY = "1200_admin_push_device";
const ENABLED_KEY = "1200_admin_push_enabled";
export function storedPushDevice() { try { return localStorage.getItem(DEVICE_KEY); } catch { return null; } }
export function rememberPushDevice(id: string) { try { localStorage.setItem(DEVICE_KEY, id);localStorage.setItem(ENABLED_KEY, "1"); } catch { /* Browser storage may be blocked; this session still works. */ } }
export function pushRenewalEnabled() { try { return localStorage.getItem(ENABLED_KEY) === "1"; } catch { return false; } }
export function supportsPush() { return typeof window !== "undefined" && window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window; }
export function needsHomeScreen() {
  return typeof window !== "undefined" && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) && !matchMedia("(display-mode: standalone)").matches && !(navigator as Navigator & { standalone?: boolean }).standalone;
}
export function vapidBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")), x => x.charCodeAt(0));
}
export async function pushRequest(path: string, method = "GET", body?: object) {
  const response = await fetch(`/api/admin/push/${path}`, { method, credentials: "same-origin", cache: "no-store", headers: { "x-admin-push": "1", ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(["not_configured", "test_limited_or_inactive", "forbidden", "unauthenticated", "queue_unavailable", "subscription_unavailable"].includes(data.code) ? data.code : "request_failed");
  return data;
}
export async function pushRegistration() {
  const existing = await navigator.serviceWorker.getRegistration("/");
  const worker = existing?.active ?? existing?.waiting ?? existing?.installing;
  if (worker && new URL(worker.scriptURL).pathname !== "/sw.js") throw new Error("worker_conflict");
  const registration = existing ?? await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  if (!registration.active) await navigator.serviceWorker.ready;
  return registration;
}
export async function disableCurrentPush() {
  const id = storedPushDevice();let failed = false;
  try { if (id) await pushRequest("subscriptions", "DELETE", { id }); } catch { failed = true; }
  try { const registration = await navigator.serviceWorker?.getRegistration("/");const subscription = await registration?.pushManager.getSubscription();if (subscription && !await subscription.unsubscribe()) failed = true; } catch { failed = true; }
  try { localStorage.removeItem(DEVICE_KEY);localStorage.removeItem(ENABLED_KEY); } catch {}
  if (failed) throw new Error("request_failed");
}
