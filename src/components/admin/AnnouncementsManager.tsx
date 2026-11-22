"use client";
import { useLocale as useInterfaceLocale } from "next-intl";
import { textFor as interfaceText } from "@/i18n/text";

import { ContentLanguageSwitcher, useAdminContentLocale } from "./content/AdminContentLocale";
import { draftText, draftChange } from "@/i18n/content-editing";
import { intlLocale } from "@/i18n/config";
import { useLocale } from "next-intl";

import { useUiText } from "@/i18n/use-ui-text";

import { useTranslations } from "next-intl";


import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import AdminSelect from "@/components/admin/AdminSelect";
import DateTimePicker from "@/components/admin/ui/DateTimePicker";
import TimedEntityStatusBadge from "@/components/admin/TimedEntityStatusBadge";
import AnnouncementPreview from "@/components/announcements/AnnouncementPreview";
import { deleteAnnouncement, saveAnnouncement, setAnnouncementActive } from "@/app/admin/(dashboard)/site-settings/announcements/actions";
import type { Announcement, AnnouncementInput } from "@/lib/announcements/types";

type Props = { announcements: Announcement[]; loadError?: string | null };
const emptyForm: AnnouncementInput = { title: "", message: "", displayType: "top_bar", ctaText: "", ctaUrl: "", startsAt: "", expiresAt: "", isDismissible: true, priority: 0, isActive: true };
const typeLabels = { top_bar: "Top Bar", booking_notice: "Booking Notice", modal: "Modal" } as const;

function toZurichInput(value: string | null) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

function formatDate(value: string | null, locale: string = "de") {
  if (!value) return "Always";
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone: "Europe/Zurich", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  const interfaceLocale = useInterfaceLocale();
  const displayText = (value: string) => interfaceText(interfaceLocale, value);

  return <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex min-h-11 w-full items-center justify-between border border-border bg-background px-4 text-left"><span className="text-[10px] uppercase tracking-[.16em] text-foreground-secondary">{displayText(label)}</span><span className={`relative h-6 w-11 rounded-full transition-colors ${checked ? "bg-accent" : "bg-surface-elevated"}`}><span className={`absolute top-1 size-4 rounded-full bg-background transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} /></span></button>;
}

function toForm(announcement: Announcement): AnnouncementInput {
  return { german: { title: announcement.title_de ?? "", message: announcement.message_de ?? "", ctaText: announcement.cta_text_de ?? "" }, title: announcement.title ?? "", message: announcement.message, displayType: announcement.display_type, ctaText: announcement.cta_text ?? "", ctaUrl: announcement.cta_url ?? "", startsAt: toZurichInput(announcement.starts_at), expiresAt: toZurichInput(announcement.expires_at), isDismissible: announcement.is_dismissible, priority: announcement.priority, isActive: announcement.is_active };
}

function formToPreview(form: AnnouncementInput, id = "new-announcement-preview"): Announcement {
  const timestamp = new Date().toISOString();
  return {
    id,
    title: form.title.trim() || null,
    message: form.message || "Your announcement message will appear here.",
    display_type: form.displayType,
    cta_text: form.ctaText.trim() || null,
    cta_url: form.ctaUrl.trim() || null,
    starts_at: null,
    expires_at: null,
    is_active: form.isActive,
    is_dismissible: form.isDismissible,
    priority: form.priority,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function PreviewPanel({ announcement }: { announcement: Announcement }) {
  const ui = useTranslations("ui");

  return <div className="mt-5 overflow-hidden border border-border bg-background"><div className="border-b border-border px-4 py-3"><p className="text-[9px] font-semibold uppercase tracking-[.2em] text-foreground-muted">{ui("mf1fbb2b43dca")}</p></div><div className="min-w-0 overflow-hidden"><AnnouncementPreview announcement={announcement} /></div></div>;
}

export default function AnnouncementsManager({ announcements, loadError }: Props) {
  const locale = useLocale();
  const { locale: contentLocale } = useAdminContentLocale();
  const copy = useTranslations("contentEditor");

  const uiText = useUiText();

  const ui = useTranslations("ui");

  const router = useRouter();
  const [editor, setEditor] = useState<{ id?: string; form: AnnouncementInput } | null>(null);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string }>();
  const [isPending, startTransition] = useTransition();
  const update = <K extends keyof AnnouncementInput>(key: K, value: AnnouncementInput[K]) => setEditor((current) => current ? { ...current, form: { ...current.form, ...(["title", "message", "ctaText"].includes(key) ? draftChange(key, String(value), contentLocale, current.form) : { [key]: value }) } } : current);
  const run = (action: () => Promise<{ success: boolean; message: string }>, close = false) => startTransition(async () => { const result = await action(); setMessage({ kind: result.success ? "success" : "error", text: result.message }); if (result.success) { if (close) setEditor(null); router.refresh(); } });

  if (editor) return <section><button type="button" onClick={() => setEditor(null)} className="inline-flex min-h-11 items-center gap-2 text-[10px] uppercase tracking-[.16em] text-foreground-secondary hover:text-accent"><X size={15} /> {" "}{ui("m3adaf6db45ad")}</button><div className="mt-4"><p className="text-[10px] uppercase tracking-[.2em] text-accent">{ui("m9a6dea22b2bb")}</p><h2 className="mt-2 font-admin-display text-3xl font-semibold text-foreground">{uiText(editor.id ? "Edit Announcement" : "Create Announcement")}</h2></div>{message ? <div className={`mt-5 border px-4 py-3 text-sm ${message.kind === "success" ? "border-emerald-500/30 text-emerald-300" : "border-red-500/30 text-red-300"}`}>{uiText(message.text)}</div> : null}<ContentLanguageSwitcher /><PreviewPanel announcement={formToPreview({ ...editor.form, title: draftText(editor.form, "title", editor.form.title, contentLocale), message: draftText(editor.form, "message", editor.form.message, contentLocale), ctaText: draftText(editor.form, "ctaText", editor.form.ctaText, contentLocale) }, editor.id ?? "new-announcement-preview")} /><div className="mt-6 border border-border bg-surface p-5 sm:p-7"><div className="grid gap-5 md:grid-cols-2"><label className="block"><span className="text-[10px] uppercase tracking-[.16em] text-foreground-muted">{ui("m768e0c1c6957")}</span><input value={draftText(editor.form, "title", editor.form.title, contentLocale)} placeholder={ui("mf9a66816e358")} onChange={(event) => update("title", event.target.value)} className="mt-2 min-h-11 w-full border border-border bg-background px-4 text-sm text-foreground outline-none focus:border-accent" /></label><AdminSelect label={ui("ma0f032444484")} value={editor.form.displayType} onChange={(value) => update("displayType", value as AnnouncementInput["displayType"])} options={Object.entries(typeLabels).map(([value, label]) => ({ value, label }))} /><label className="block md:col-span-2"><span className="text-[10px] uppercase tracking-[.16em] text-foreground-muted">{ui("m8addb891254a")}</span><textarea rows={5} required value={draftText(editor.form, "message", editor.form.message, contentLocale)} onChange={(event) => update("message", event.target.value)} className="mt-2 w-full resize-y border border-border bg-background px-4 py-3 text-sm leading-6 text-foreground outline-none focus:border-accent" /></label><label className="block"><span className="text-[10px] uppercase tracking-[.16em] text-foreground-muted">{ui("md6cf8a96365c")}</span><input value={draftText(editor.form, "ctaText", editor.form.ctaText, contentLocale)} placeholder={ui("m88d19e98b648")} onChange={(event) => update("ctaText", event.target.value)} className="mt-2 min-h-11 w-full border border-border bg-background px-4 text-sm text-foreground outline-none focus:border-accent" /></label><label className="block"><span className="text-[10px] uppercase tracking-[.16em] text-foreground-muted">{ui("mec1f64c1fa90")}</span><input value={editor.form.ctaUrl} onChange={(event) => update("ctaUrl", event.target.value)} placeholder={ui("mf80014f90e7c")} className="mt-2 min-h-11 w-full border border-border bg-background px-4 text-sm text-foreground outline-none focus:border-accent" /></label><DateTimePicker mode="datetime" minuteStep={5} label={ui("mfefd29e4de6e")} value={editor.form.startsAt} onChange={(value) => update("startsAt", value)} clearable placeholder={ui("mb5f2d3b365d5")} /><DateTimePicker mode="datetime" minuteStep={5} label={ui("m764a14539120")} value={editor.form.expiresAt} onChange={(value) => update("expiresAt", value)} minDate={editor.form.startsAt.slice(0, 10) || undefined} clearable placeholder={ui("m820b15864313")} /><label className="block"><span className="text-[10px] uppercase tracking-[.16em] text-foreground-muted">{ui("m886cbff9d9df")}</span><input type="number" step="1" value={editor.form.priority} onChange={(event) => update("priority", Number(event.target.value))} className="mt-2 min-h-11 w-full border border-border bg-background px-4 text-sm text-foreground outline-none focus:border-accent" /><span className="mt-2 block text-xs text-foreground-muted">{ui("m7f84154774df")}</span></label><div className="grid gap-3"><Toggle label={ui("mf16dedd40cc2")} checked={editor.form.isDismissible} onChange={(value) => update("isDismissible", value)} /><Toggle label={ui("ma733b809d2f1")} checked={editor.form.isActive} onChange={(value) => update("isActive", value)} /></div></div><div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" onClick={() => setEditor(null)} className="min-h-11 border border-border px-5 text-[10px] uppercase tracking-[.16em] text-foreground">{ui("m77dfd2135f4d")}</button><button type="button" disabled={isPending} onClick={() => startTransition(async () => { const result = await saveAnnouncement(editor.form, editor.id, contentLocale); setMessage({ kind: result.success ? "success" : "error", text: result.success ? copy("saved", { language: contentLocale.toUpperCase() }) : `${copy("failed", { language: contentLocale.toUpperCase() })} ${uiText(result.message)}` }); if (result.success) { setEditor(current => current ? { ...current, id: result.id ?? current.id } : current); router.refresh(); } })} className="min-h-11 bg-accent px-6 text-[10px] font-semibold uppercase tracking-[.16em] text-background disabled:opacity-50">{uiText(isPending ? "Saving…" : "Save Announcement")}</button></div></div></section>;

  return <section>{message ? <div className={`mb-6 border px-4 py-3 text-sm ${message.kind === "success" ? "border-emerald-500/30 text-emerald-300" : "border-red-500/30 text-red-300"}`}>{uiText(message.text)}</div> : null}{loadError ? <div className="mb-6 border border-red-500/30 px-4 py-3 text-sm text-red-300">{uiText(loadError)}</div> : null}<div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="font-admin-display text-2xl font-semibold text-foreground">{ui("m06b01c44a6f7")}</h2><p className="mt-2 text-sm text-foreground-secondary">{ui("md38ce1b2b5da")}</p></div><button type="button" onClick={() => { setEditor({ form: emptyForm }); setMessage(undefined); }} className="inline-flex min-h-11 items-center gap-2 bg-accent px-5 text-[10px] font-semibold uppercase tracking-[.16em] text-background"><Plus size={15} /> {" "}{ui("mab68a44a6352")}</button></div><div className="mt-6 grid gap-4 lg:grid-cols-2">{announcements.map((announcement) => <article key={announcement.id} className="min-w-0 border border-border bg-surface p-5"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="text-[9px] uppercase tracking-[.16em] text-accent">{typeLabels[announcement.display_type]} {" "}{ui("m96469a25b67d")}{" "}{announcement.priority}</p><h3 className="mt-3 font-admin-display text-xl font-semibold text-foreground">{announcement.title || announcement.message.slice(0, 72)}</h3>{announcement.title ? <p className="mt-2 line-clamp-2 text-sm leading-6 text-foreground-secondary">{announcement.message}</p> : null}</div><TimedEntityStatusBadge entity={announcement} /></div><dl className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-4 text-xs"><div><dt className="uppercase tracking-[.14em] text-foreground-muted">{ui("mfc612a2fcc72")}</dt><dd className="mt-1 text-foreground-secondary">{formatDate(announcement.starts_at, locale)}</dd></div><div><dt className="uppercase tracking-[.14em] text-foreground-muted">{ui("ma99be3da0c9d")}</dt><dd className="mt-1 text-foreground-secondary">{formatDate(announcement.expires_at, locale)}</dd></div></dl><PreviewPanel announcement={announcement} /><div className="mt-5 grid grid-cols-3 gap-2"><button type="button" disabled={isPending} onClick={() => run(() => setAnnouncementActive(announcement.id, !announcement.is_active))} className="min-h-10 border border-border px-2 text-[9px] uppercase tracking-[.12em] text-foreground hover:border-accent disabled:opacity-50">{uiText(announcement.is_active ? "Disable" : "Enable")}</button><button type="button" onClick={() => { setEditor({ id: announcement.id, form: toForm(announcement) }); setMessage(undefined); }} className="inline-flex min-h-10 items-center justify-center gap-2 border border-border px-2 text-[9px] uppercase tracking-[.12em] text-foreground hover:border-accent"><Pencil size={13} /> {" "}{ui("m5301648dcf6b")}</button><button type="button" disabled={isPending} onClick={() => { if (window.confirm(uiText("Delete this announcement permanently?"))) run(() => deleteAnnouncement(announcement.id)); }} className="inline-flex min-h-10 items-center justify-center gap-2 border border-red-500/30 px-2 text-[9px] uppercase tracking-[.12em] text-red-300 disabled:opacity-50"><Trash2 size={13} /> {" "}{ui("mf6fdbe48dc54")}</button></div></article>)}{!announcements.length && !loadError ? <div className="border border-dashed border-border px-6 py-16 text-center text-sm text-foreground-muted lg:col-span-2">{ui("m02975a3749d3")}</div> : null}</div></section>;
}
