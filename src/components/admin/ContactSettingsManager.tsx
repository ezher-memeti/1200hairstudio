"use client";
import { useLocale as useInterfaceLocale } from "next-intl";
import { textFor as interfaceText } from "@/i18n/text";

import { ContentLanguageSwitcher, useAdminContentLocale } from "./content/AdminContentLocale";
import { draftText, draftChange } from "@/i18n/content-editing";
import { useUiText } from "@/i18n/use-ui-text";

import { useTranslations } from "next-intl";


import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "@/i18n/navigation";
import { AtSign, MapPin, PenLine, Phone } from "lucide-react";
import ContactSection from "@/components/home/ContactSection";
import { saveContactSectionSettings } from "@/app/admin/(dashboard)/site-settings/contact/actions";
import type { ContactSectionSettings } from "@/lib/contact-section/types";

type Props = { initialSettings: ContactSectionSettings; initialError?: string };

function Toggle({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (value: boolean) => void }) {
  const interfaceLocale = useInterfaceLocale();
  const displayText = (value: string) => interfaceText(interfaceLocale, value);

  return <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex min-h-12 w-full items-center justify-between gap-5 border-y border-border py-3 text-left"><span><span className="block text-sm text-foreground">{displayText(label)}</span>{description ? <span className="mt-1 block text-xs leading-5 text-foreground-muted">{displayText(description)}</span> : null}</span><span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-accent" : "bg-surface-elevated"}`}><span className={`absolute top-1 size-4 rounded-full bg-background transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} /></span></button>;
}

function Field({ label, value, onChange, placeholder, multiline = false, type = "text" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; multiline?: boolean; type?: string }) {
  const interfaceLocale = useInterfaceLocale();
  const displayText = (value: string) => interfaceText(interfaceLocale, value);

  return <label className="block min-w-0"><span className="text-[10px] uppercase tracking-[.16em] text-foreground-muted">{displayText(label)}</span>{multiline ? <textarea rows={3} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-2 w-full resize-y border border-border bg-background px-4 py-3 text-base leading-6 text-foreground outline-none placeholder:text-foreground-muted focus:border-accent sm:text-sm"/> : <input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-2 min-h-12 w-full border border-border bg-background px-4 text-base text-foreground outline-none placeholder:text-foreground-muted focus:border-accent sm:text-sm"/>}</label>;
}

function ConfigSection({ icon, title, description, children }: { icon: ReactNode; title: string; description: string; children: ReactNode }) {
  const interfaceLocale = useInterfaceLocale();
  const displayText = (value: string) => interfaceText(interfaceLocale, value);

  return <section className="border border-border bg-surface p-4 sm:p-6"><div className="flex items-start gap-4 border-b border-border pb-4"><span className="flex size-10 shrink-0 items-center justify-center border border-border text-accent" aria-hidden="true">{icon}</span><div className="min-w-0"><h3 className="font-admin-display text-xl font-semibold text-foreground">{displayText(title)}</h3><p className="mt-1 text-xs leading-5 text-foreground-muted">{displayText(description)}</p></div></div><div className="mt-5">{children}</div></section>;
}

export default function ContactSettingsManager({ initialSettings, initialError = "" }: Props) {
  const uiText = useUiText();
  const { locale: contentLocale } = useAdminContentLocale();
  const copy = useTranslations("contentEditor");
  const localizedKeys = ["eyebrow", "title", "description", "callCtaLabel", "instagramCtaLabel", "leaveReviewCtaLabel"];

  const ui = useTranslations("ui");

  const router = useRouter();
  const [settings, setSettings] = useState(initialSettings);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(initialError ? { kind: "error", text: initialError } : null);
  const [isPending, startTransition] = useTransition();
  const update = <K extends keyof ContactSectionSettings>(key: K, value: ContactSectionSettings[K]) => { setSettings((current) => ({ ...current, ...(localizedKeys.includes(key) ? draftChange(key, String(value), contentLocale, current) : { [key]: value }) })); setFeedback(null); };
  const save = () => startTransition(async () => { const result = await saveContactSectionSettings(settings, contentLocale); setFeedback({ kind: result.success ? "success" : "error", text: result.success ? copy("saved", { language: contentLocale.toUpperCase() }) : `${copy("failed", { language: contentLocale.toUpperCase() })} ${uiText(result.message)}` }); if (result.success) router.refresh(); });

  return <section className="min-w-0"><div className="border-b border-border pb-5"><h2 className="font-admin-display text-2xl font-semibold text-foreground sm:text-3xl">{ui("mb37456c4530b")}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-foreground-secondary">{ui("m36058dc0417d")}</p><ContentLanguageSwitcher /></div>{feedback ? <div role="status" className={`mt-5 border px-4 py-3 text-sm ${feedback.kind === "success" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-rose-500/30 bg-rose-500/10 text-rose-200"}`}>{uiText(feedback.text)}</div> : null}<div className="mt-6 grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(420px,.9fr)]"><div className="min-w-0 space-y-6"><section className="border border-border bg-surface p-4 sm:p-6"><div className="border-b border-border pb-4"><h3 className="font-admin-display text-xl font-semibold text-foreground">{ui("m66d7e109108b")}</h3><p className="mt-1 text-xs leading-5 text-foreground-muted">{ui("mbcedeaa925ac")}</p></div><div className="mt-5"><Toggle label={ui("m03e24466ba8f")} description={ui("m2ea2400c9d16")} checked={settings.isEnabled} onChange={(value) => update("isEnabled", value)}/></div><div className="mt-5 grid gap-5 sm:grid-cols-2"><Field label={ui("m807f691620ab")} value={draftText(settings, "eyebrow", settings.eyebrow, contentLocale)} onChange={(value) => update("eyebrow", value)} placeholder={ui("mb37456c4530b")}/><Field label={ui("m768e0c1c6957")} value={draftText(settings, "title", settings.title, contentLocale)} onChange={(value) => update("title", value)} placeholder={ui("m26825dedd2df")}/></div></section>
          <ConfigSection icon={<Phone size={18}/>} title={ui("m77064d526523")} description={ui("m45d72aa58c53")}><div className="grid gap-5 sm:grid-cols-2"><Field label={ui("mab25d61bb124")} type="tel" value={settings.phoneNumber} onChange={(value) => update("phoneNumber", value)} placeholder={ui("m3d25e8cd47a3")}/><Field label={ui("me4b9afac94b8")} value={settings.phoneDisplay} onChange={(value) => update("phoneDisplay", value)} placeholder={ui("mee357ae59bb5")}/><div className="sm:col-span-2"><Field label={ui("m7b13ccc7d5a1")} value={draftText(settings, "callCtaLabel", settings.callCtaLabel, contentLocale)} onChange={(value) => update("callCtaLabel", value)} placeholder={ui("m291a0a58dfa6")}/></div></div></ConfigSection>
          <ConfigSection icon={<AtSign size={18}/>} title={uiText("Instagram")} description={ui("m74f10c664584")}><Toggle label={ui("m538688df53e1")} checked={settings.instagramEnabled} onChange={(value) => update("instagramEnabled", value)}/>{settings.instagramEnabled ? <div className="mt-5 grid gap-5 sm:grid-cols-2"><Field label={ui("m84c29015de33")} value={settings.instagramUsername} onChange={(value) => update("instagramUsername", value)} placeholder={ui("maaa8866ec21f")}/><Field label="Instagram URL" type="url" value={settings.instagramUrl} onChange={(value) => update("instagramUrl", value)} placeholder={uiText("https://instagram.com/...")}/><div className="sm:col-span-2"><Field label={ui("m7b13ccc7d5a1")} value={draftText(settings, "instagramCtaLabel", settings.instagramCtaLabel, contentLocale)} onChange={(value) => update("instagramCtaLabel", value)} placeholder={uiText("Instagram")}/></div></div> : null}</ConfigSection>
          <ConfigSection icon={<PenLine size={18}/>} title={ui("m5e65b6501a49")} description={ui("mb7650cd33dd0")}><Toggle label={ui("mee602670dca5")} checked={settings.googleReviewsEnabled} onChange={(value) => update("googleReviewsEnabled", value)}/>{settings.googleReviewsEnabled ? <div className="mt-5 grid gap-5 sm:grid-cols-2"><Field label={ui("mfcc64511ae5f")} type="url" value={settings.googleLeaveReviewUrl} onChange={(value) => update("googleLeaveReviewUrl", value)} placeholder={uiText("https://g.page/...")}/><Field label={ui("m7b13ccc7d5a1")} value={draftText(settings, "leaveReviewCtaLabel", settings.leaveReviewCtaLabel, contentLocale)} onChange={(value) => update("leaveReviewCtaLabel", value)} placeholder={ui("me1fc8a9420cd")}/></div> : null}</ConfigSection>
          <details className="border border-border bg-surface"><summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-4 text-[10px] uppercase tracking-[.18em] text-foreground-secondary outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent sm:px-6"><span>{ui("me7a11a92c5e1")}</span><span className="text-accent">+</span></summary><div className="border-t border-border p-4 sm:p-6"><div className="flex items-start gap-4"><MapPin size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden="true"/><p className="text-xs leading-5 text-foreground-muted">{ui("m823d587ac2f1")}</p></div><div className="mt-5 grid gap-5 sm:grid-cols-2"><div className="sm:col-span-2"><Field label={ui("m55f8ebc805e6")} value={draftText(settings, "description", settings.description, contentLocale)} onChange={(value) => update("description", value)} placeholder={ui("mf1da5c02d4ea")} multiline/></div><Field label={ui("md70f93df5e8f")} value={settings.address} onChange={(value) => update("address", value)} placeholder={ui("mc61d40a41f8e")}/><Field label={ui("m23daa3873e51")} type="url" value={settings.mapUrl} onChange={(value) => update("mapUrl", value)} placeholder={ui("mff6733a75daf")}/></div></div></details>
          <div className="sticky bottom-0 z-10 flex flex-col-reverse gap-3 border-t border-border bg-background/95 py-4 pb-[max(16px,env(safe-area-inset-bottom))] backdrop-blur sm:flex-row sm:justify-end"><button type="button" title={copy("reset")} onClick={() => { setSettings(current => contentLocale === "de" ? { ...current, german: { ...initialSettings.german } } : { ...current, ...Object.fromEntries(localizedKeys.map(key => [key, initialSettings[key as "title"]])) }); setFeedback(null); }} disabled={isPending} className="min-h-12 border border-border px-5 text-[10px] uppercase tracking-[.16em] text-foreground-secondary disabled:opacity-50">{ui("m44c57abd888a")}</button><button type="button" onClick={save} disabled={isPending} className="min-h-12 bg-accent px-7 text-[10px] font-semibold uppercase tracking-[.18em] text-background disabled:opacity-50">{uiText(isPending ? "Saving..." : "Save Contact Settings")}</button></div>
        </div><aside className="min-w-0 xl:sticky xl:top-6 xl:self-start"><p className="mb-3 text-[10px] uppercase tracking-[.18em] text-foreground-muted">{ui("mdbdc511c9545")}</p><div className="min-w-0 overflow-hidden border border-border bg-background"><ContactSection settings={{ ...settings, ...Object.fromEntries(localizedKeys.map(key => [key, draftText(settings, key, settings[key as "title"], contentLocale)])) }} preview/></div></aside></div></section>;
}
