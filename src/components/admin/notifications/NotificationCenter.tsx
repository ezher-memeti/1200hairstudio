"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, CalendarCheck, Check, CheckCheck, Circle, Loader2, UserPlus, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import type { AdminNotification, NotificationPage } from "@/lib/notifications/types";
import { appointmentNotificationTime, notificationGroup, relativeNotificationTime } from "@/lib/notifications/presentation";
import styles from "./NotificationCenter.module.css";

async function api(path = "", method = "GET", body?: object) {
  const response = await fetch(`/api/admin/notifications${path}`, {
    method, credentials: "same-origin", cache: "no-store",
    headers: { "x-admin-notifications": "1", ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error("unavailable");
  return data;
}
const control = "inline-flex min-h-11 items-center justify-center gap-2 px-3 text-xs text-foreground-secondary transition-colors hover:bg-surface hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40";
export default function NotificationCenter() {
  const t = useTranslations("notifications"), locale = useLocale(), router = useRouter();
  const pathname = usePathname(), search = useSearchParams().toString();
  const dialog = useRef<HTMLDialogElement>(null), bell = useRef<HTMLButtonElement>(null);
  const listVersion = useRef(0), countVersion = useRef(0), countPending = useRef<Promise<void> | null>(null), mutation = useRef(false);
  const [open, setOpen] = useState(false), [filter, setFilter] = useState<"all" | "unread">("all");
  const [items, setItems] = useState<AdminNotification[]>([]), [cursor, setCursor] = useState<string | null>(null);
  const [unread, setUnread] = useState(0), [loading, setLoading] = useState(false), [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false), [countFailed, setCountFailed] = useState(false), [missing, setMissing] = useState(false);
  const refreshCount = useCallback(async () => {
    if (mutation.current) return;
    if (countPending.current) return countPending.current;
    const version = ++countVersion.current;
    const pending = (async () => {
      try { const result = await api("/count");if (version === countVersion.current) { setUnread(result.unread);setCountFailed(false); } }
      catch { if (version === countVersion.current) setCountFailed(true); }
    })();
    countPending.current = pending;
    try { await pending; } finally { if (countPending.current === pending) countPending.current = null; }
  }, []);
  const loadPage = useCallback(async (next: string | null = null) => {
    const version = ++listVersion.current;
    setLoading(true);setFailed(false);
    if (!next) { setItems([]);setCursor(null); }
    try {
      const result: NotificationPage = await api(`?filter=${filter}${next ? `&cursor=${encodeURIComponent(next)}` : ""}`);
      if (version !== listVersion.current) return;
      setItems(previous => next ? [...previous, ...result.items.filter(row => !previous.some(old => old.id === row.id))] : result.items);
      setCursor(result.nextCursor);
    } catch { if (version === listVersion.current) setFailed(true); }
    finally { if (version === listVersion.current) setLoading(false); }
  }, [filter]);
  useEffect(() => {
    void refreshCount();setOpen(false);
  }, [pathname, search, refreshCount]);
  useEffect(() => {
    const visible = () => { if (document.visibilityState === "visible") void refreshCount(); };
    window.addEventListener("focus", visible);document.addEventListener("visibilitychange", visible);
    return () => { window.removeEventListener("focus", visible);document.removeEventListener("visibilitychange", visible); };
  }, [refreshCount]);
  const invalidateList = useCallback(() => { listVersion.current++; }, []);
  useEffect(() => {
    if (!open) return;
    void loadPage();void refreshCount();
    return invalidateList;
  }, [open, loadPage, refreshCount, invalidateList]);
  useEffect(() => {
    const panel = dialog.current, trigger = bell.current;
    if (!open) { panel?.close();return; }
    panel?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow;panel?.close();trigger?.focus({ preventScroll: true }); };
  }, [open]);
  async function change(row: AdminNotification | null, action: "toggle" | "open" | "all") {
    if (mutation.current || loading) return;
    mutation.current = true;countVersion.current++;setBusy(true);setFailed(false);
    const previous = items, previousCount = unread;
    const markRead = action !== "toggle" || !row?.read_at;
    if (action === "all") { setUnread(0);setItems(filter === "unread" ? [] : items.map(item => ({ ...item, read_at: item.read_at ?? new Date().toISOString() }))); }
    else if (row) {
      const nextRead = markRead ? row.read_at ?? new Date().toISOString() : null;
      setUnread(count => Math.max(0, count + (row.read_at && !markRead ? 1 : !row.read_at && markRead ? -1 : 0)));
      setItems(current => current.map(item => item.id === row.id ? { ...item, read_at: nextRead } : item).filter(item => filter !== "unread" || !item.read_at));
    }
    try {
      const result = action === "all" ? await api("/read-all", "POST", {}) : action === "open" ? await api(`/${row!.id}/open`, "POST", {}) : await api(`/${row!.id}`, "PATCH", { read: markRead });
      if (action === "open") { setOpen(false);setMissing(Boolean(result.missing));router.push(result.href); }
      if (action === "all") { setCursor(null);await loadPage(); }
    } catch { setItems(previous);setUnread(previousCount);setFailed(true); }
    finally { mutation.current = false;setBusy(false);if (countPending.current) await countPending.current;await refreshCount(); }
  }
  const groups = ["today", "yesterday", "earlier"] as const;
  return <>
    <button ref={bell} type="button" onClick={() => setOpen(true)} aria-label={t("bell", { count: unread })} aria-haspopup="dialog" aria-expanded={open} className="relative inline-flex size-11 shrink-0 items-center justify-center border border-border text-foreground-secondary transition-colors hover:border-accent hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
      <Bell size={19} strokeWidth={1.4} aria-hidden="true" />
      {unread > 0 && <span aria-hidden="true" className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center bg-accent px-1 text-[9px] font-semibold text-background">{unread > 9 ? "9+" : unread}</span>}
    </button>
    {missing && <div role="status" className="fixed inset-x-4 top-[max(1rem,env(safe-area-inset-top))] z-[150] mx-auto flex max-w-md items-center justify-between gap-3 border border-border bg-background-secondary p-4 text-sm text-foreground"><span>{t("missing")}</span><button type="button" className={control} onClick={() => setMissing(false)} aria-label={t("close")}><X size={18} /></button></div>}
    <dialog ref={dialog} aria-labelledby="notification-heading" className={styles.panel} onCancel={() => setOpen(false)} onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect();if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) setOpen(false); } }}>
      <div className="flex max-h-[min(44rem,calc(100dvh-3rem))] flex-col pb-[env(safe-area-inset-bottom)]">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
          <div><h2 id="notification-heading" className="font-admin-display text-xl text-foreground">{t("heading")}</h2><p className="mt-1 text-xs text-foreground-muted" role="status">{t("unreadCount", { count: unread })}</p></div>
          <button type="button" className={control} onClick={() => setOpen(false)} aria-label={t("close")}><X size={18} aria-hidden="true" /></button>
        </header>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2 sm:px-5">
          <div className="flex gap-1" role="group" aria-label={t("filter")}>{(["all", "unread"] as const).map(value => <button type="button" key={value} disabled={busy} onClick={() => setFilter(value)} aria-pressed={filter === value} className={`${control} ${filter === value ? "bg-surface text-accent" : ""}`}>{t(value)}</button>)}</div>
          <button type="button" disabled={busy || loading || !unread} className={control} onClick={() => change(null, "all")}><CheckCheck size={15} aria-hidden="true" />{t("markAll")}</button>
        </div>
        <div className="min-h-40 min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-6" aria-busy={loading || busy}>
          {(failed || countFailed) && <div role="alert" className="mb-3 text-sm text-foreground-secondary">{t("error")} <button type="button" disabled={busy || loading} className={control} onClick={() => { void loadPage();void refreshCount(); }}>{t("retry")}</button></div>}
          {!loading && !failed && items.length === 0 && <p className="py-12 text-center text-sm text-foreground-muted">{t(filter === "unread" ? "emptyUnread" : "empty")}</p>}
          {groups.map(group => {
            const rows = items.filter(row => notificationGroup(row.created_at) === group);
            return rows.length ? <section key={group} aria-label={t(group)}><h3 className="pb-2 pt-4 text-[10px] uppercase tracking-[0.18em] text-foreground-muted">{t(group)}</h3><ul className="space-y-1">{rows.map(row => {
              const Icon = row.kind === "customer_registered" ? UserPlus : row.kind === "appointment_completed" ? CheckCheck : CalendarCheck;
              const time = appointmentNotificationTime(row, locale);
              return <li key={row.id} className={`flex min-w-0 gap-1 transition-colors ${row.read_at ? "opacity-65 hover:opacity-100" : "bg-surface/50"}`}>
                <button type="button" disabled={busy} onClick={() => change(row, "open")} className="flex min-w-0 flex-1 items-start gap-3 px-2 py-4 text-left transition-colors hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
                  <Icon size={18} strokeWidth={1.4} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
                  <span className="min-w-0"><span className="flex items-center gap-2 text-sm font-semibold text-foreground">{t(`${row.kind}_title`)}{!row.read_at && <span className="size-1 shrink-0 bg-accent" aria-label={t("unread")} />}</span><span className="mt-1 block break-words text-xs leading-5 text-foreground-secondary">{row.kind === "appointment_confirmed" && time ? t("appointmentTime", { time }) : t(`${row.kind}_body`)}</span><time dateTime={row.created_at} title={new Intl.DateTimeFormat(locale === "de" ? "de-CH" : "en-GB", { timeZone: "Europe/Zurich", dateStyle: "medium", timeStyle: "short" }).format(new Date(row.created_at))} className="mt-2 block text-[10px] text-foreground-muted">{relativeNotificationTime(row.created_at, locale)}</time></span>
                </button>
                <button type="button" disabled={busy} className={`${control} my-2 shrink-0 self-start px-2`} onClick={() => change(row, "toggle")} aria-label={t(row.read_at ? "markUnread" : "markRead")}>{row.read_at ? <Circle size={14} aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}</button>
              </li>;
            })}</ul></section> : null;
          })}
          {loading && <p role="status" className="flex items-center justify-center gap-2 py-8 text-xs text-foreground-muted"><Loader2 size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />{t("loading")}</p>}
          {cursor && !loading && <button type="button" disabled={busy} className={`${control} my-3 w-full border border-border`} onClick={() => loadPage(cursor)}>{t("loadMore")}</button>}
        </div>
      </div>
    </dialog>
  </>;
}
