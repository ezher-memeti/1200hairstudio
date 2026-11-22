"use client";
import { useLocale as useInterfaceLocale } from "next-intl";
import { textFor as interfaceText } from "@/i18n/text";

import { useUiText } from "@/i18n/use-ui-text";

import { useTranslations } from "next-intl";


import { useMemo, useState, useTransition } from "react";
import { Check } from "lucide-react";
import AdminSelect from "@/components/admin/AdminSelect";
import { saveLoyaltySettings } from "@/app/admin/(dashboard)/site-settings/loyalty/actions";
import type { LoyaltySettings } from "@/lib/loyalty/settings";

const inputClass = "mt-2 min-h-11 w-full rounded-[3px] border border-border bg-[#11110f] px-4 font-admin-primary text-base text-foreground outline-none transition-colors placeholder:text-foreground-muted focus:border-accent sm:text-sm";
const labelClass = "font-admin-primary text-[10px] uppercase tracking-[0.16em] text-foreground-muted";

function Toggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  const interfaceLocale = useInterfaceLocale();
  const displayText = (value: string) => interfaceText(interfaceLocale, value);

  return <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex min-h-16 w-full items-center justify-between gap-4 border-b border-border/70 py-4 text-left last:border-b-0"><span><span className="block text-sm font-medium text-foreground">{displayText(label)}</span><span className="mt-1 block text-xs leading-5 text-foreground-muted">{displayText(description)}</span></span><span className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${checked ? "border-accent bg-accent" : "border-border bg-background"}`}><span className={`absolute top-1/2 size-4 -translate-y-1/2 rounded-full transition-all ${checked ? "left-6 bg-background" : "left-1 bg-foreground-muted"}`} /></span></button>;
}

export default function LoyaltySettingsManager({ initialSettings, initialError }: { initialSettings: LoyaltySettings; initialError: string }) {
  const uiText = useUiText();

  const ui = useTranslations("ui");
  const audit = useTranslations("audit");

  const [settings, setSettings] = useState(initialSettings);
  const [saved, setSaved] = useState(initialSettings);
  const [notice, setNotice] = useState(initialError);
  const [noticeKind, setNoticeKind] = useState<"success" | "error">("error");
  const [pending, startTransition] = useTransition();
  const dirty = useMemo(() => JSON.stringify(settings) !== JSON.stringify(saved), [settings, saved]);
  const sampleVisits = Math.min(7, settings.visitsRequired);
  const shownDots = Math.min(settings.visitsRequired, 20);
  const rewardLabel = settings.rewardType === "fixed_discount" ? `CHF ${Number(settings.rewardValue ?? 0).toFixed(2)} OFF` : settings.rewardType === "percentage" ? `${Number(settings.rewardValue ?? 0)}% OFF` : "FREE SERVICE";

  function update(value: LoyaltySettings) {
    setSettings(value);
    setNotice("");
  }

  function save() {
    startTransition(async () => {
      const result = await saveLoyaltySettings(settings);
      setNotice(result.message);
      setNoticeKind(result.success ? "success" : "error");
      if (result.success) setSaved(settings);
    });
  }

  return <section className="min-w-0">
    <div className="border-b border-border pb-5"><div className="flex flex-wrap items-center gap-3"><h2 className="font-admin-display text-2xl font-semibold text-foreground sm:text-3xl">{ui("m065f7d695569")}</h2>{dirty ? <span className="border border-accent/30 bg-accent/10 px-2 py-1 text-[9px] uppercase tracking-[0.16em] text-accent">{ui("m29267269c048")}</span> : null}</div><p className="mt-2 max-w-2xl text-sm leading-6 text-foreground-secondary">{ui("ma9c215629fec")}</p></div>
    <div className="mt-6 grid min-w-0 gap-7 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.75fr)] xl:gap-10">
      <div className="min-w-0">
        <div className="border-y border-border px-1"><Toggle label={ui("m466f6735198e")} description={ui("mf42c2183451f")} checked={settings.isEnabled} onChange={(isEnabled) => update({ ...settings, isEnabled })} /></div>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <label><span className={labelClass}>{ui("mf5c87955dc18")}</span><input type="number" min={1} step={1} required value={settings.visitsRequired} onChange={(event) => update({ ...settings, visitsRequired: Number(event.target.value) })} className={inputClass} /></label>
          <AdminSelect label={ui("mdf74fcdc2341")} value={settings.rewardType} onChange={(rewardType) => update({ ...settings, rewardType: rewardType as LoyaltySettings["rewardType"], rewardValue: rewardType === "free_service" ? null : settings.rewardValue ?? 0 })} options={[{ value: "fixed_discount", label: "Fixed Discount" }, { value: "percentage", label: "Percentage Discount" }, { value: "free_service", label: "Free Service" }]} />
          {settings.rewardType !== "free_service" ? <label><span className={labelClass}>{uiText(settings.rewardType === "percentage" ? "Reward Value (%)" : "Reward Value (CHF)")}</span><input type="number" min={0} max={settings.rewardType === "percentage" ? 100 : undefined} step={settings.rewardType === "percentage" ? 1 : 0.01} required value={settings.rewardValue ?? 0} onChange={(event) => update({ ...settings, rewardValue: Number(event.target.value) })} className={inputClass} /></label> : null}
          <AdminSelect label={ui("mea74619253fe")} value={settings.rewardExpiryDays === null ? "never" : "limited"} onChange={(value) => update({ ...settings, rewardExpiryDays: value === "never" ? null : settings.rewardExpiryDays ?? 30 })} options={[{ value: "never", label: "No Expiry" }, { value: "limited", label: "Expire After X Days" }]} />
          {settings.rewardExpiryDays !== null ? <label><span className={labelClass}>{ui("ma67b9ede00ab")}</span><input type="number" min={1} step={1} required value={settings.rewardExpiryDays} onChange={(event) => update({ ...settings, rewardExpiryDays: Number(event.target.value) })} className={inputClass} /></label> : null}
        </div>
        <div className="mt-6 border-y border-border px-1"><Toggle label={ui("m92de56d95ce4")} description={ui("m6ca5b2dbdcea")} checked={settings.rewardVisitCountsTowardNext} onChange={(rewardVisitCountsTowardNext) => update({ ...settings, rewardVisitCountsTowardNext })} /></div>
      </div>
      <aside className="min-w-0 border-l border-accent/50 bg-surface px-5 py-6 sm:px-6"><p className="text-[10px] uppercase tracking-[0.22em] text-accent">{ui("m2936e723cab6")}</p><div className="mt-5 flex items-center justify-between gap-4 border-b border-border pb-4"><span className="text-sm text-foreground-secondary">{ui("mbae7d5be7082")}</span><span className={`text-[10px] uppercase tracking-[0.16em] ${settings.isEnabled ? "text-emerald-300" : "text-foreground-muted"}`}>{uiText(settings.isEnabled ? "Enabled" : "Disabled")}</span></div><dl className="divide-y divide-border"><div className="py-4"><dt className={labelClass}>{ui("m18d98b4e402d")}</dt><dd className="mt-2 text-base">{settings.visitsRequired} {" "}{ui("m044b76907317")}</dd></div><div className="py-4"><dt className={labelClass}>{ui("mc7d7652ec6a7")}</dt><dd className="mt-2 font-admin-display text-2xl text-accent">{uiText(rewardLabel)}</dd></div><div className="py-4"><dt className={labelClass}>{ui("mba8f571e0f93")}</dt><dd className="mt-2 text-sm">{uiText(settings.rewardExpiryDays === null ? "Never" : audit("expiryDays", { count: settings.rewardExpiryDays }))}</dd></div><div className="py-4"><dt className={labelClass}>{ui("m0f62ce4443ce")}</dt><dd className="mt-2 text-sm">{uiText(settings.rewardVisitCountsTowardNext ? "Yes" : "No")}</dd></div></dl><div className="mt-5 border-t border-border pt-5"><div className="flex items-end justify-between gap-4"><p className="text-sm">{sampleVisits} / {settings.visitsRequired} {" "}{ui("mec7b4ab40a2e")}</p><p className="text-xs text-foreground-muted">{ui("m853458ea6caf")}</p></div><div className="mt-4 flex flex-wrap gap-2">{Array.from({ length: shownDots }, (_, index) => <span key={index} className={`size-2.5 rounded-full border ${index < sampleVisits ? "border-accent bg-accent" : "border-border"}`} />)}</div>{settings.visitsRequired > shownDots ? <p className="mt-3 text-xs text-foreground-muted">{ui("m277cd6c88b77")}{" "}{settings.visitsRequired} {" "}{ui("m0b6ddfe0119b")}</p> : null}<p className="mt-3 text-xs text-foreground-secondary">{Math.max(0, settings.visitsRequired - sampleVisits)} {" "}{ui("md46bf845633a")}</p></div></aside>
    </div>
    <div className="mt-7 flex flex-col gap-4 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between"><div aria-live="polite">{notice ? <p className={`text-sm ${noticeKind === "success" ? "text-emerald-300" : "text-red-300"}`}>{uiText(notice)}</p> : dirty ? <p className="text-xs text-foreground-muted">{ui("m4e7362be3ed7")}</p> : <p className="flex items-center gap-2 text-xs text-foreground-muted"><Check size={13} /> {" "}{ui("m9595b7da9f61")}</p>}</div><button type="button" disabled={pending || !dirty} onClick={save} className="min-h-11 bg-accent px-6 text-[10px] font-semibold uppercase tracking-[0.16em] text-background hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface disabled:text-foreground-muted">{uiText(pending ? "Saving…" : "Save Changes")}</button></div>
  </section>;
}
