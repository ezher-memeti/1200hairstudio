"use client";
import { useLocale as useInterfaceLocale } from "next-intl";
import { textFor as interfaceText } from "@/i18n/text";

import { ContentLanguageSwitcher, useAdminContentLocale } from "./content/AdminContentLocale";
import { draftText, draftChange } from "@/i18n/content-editing";
import { intlLocale } from "@/i18n/config";
import { useLocale } from "next-intl";

import { useUiText } from "@/i18n/use-ui-text";

import { useTranslations } from "next-intl";


import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { ChevronLeft, ChevronRight, Mail, Send, Users, X, type LucideIcon } from "lucide-react";
import {
  deleteMarketingDraft,
  deleteMarketingTemplate,
  loadMarketingCampaign,
  saveMarketingDraft,
  saveMarketingTemplate,
  sendMarketingTest,
} from "@/app/admin/(dashboard)/marketing/actions";
import type {
  MarketingAudienceFilters,
  MarketingCampaign,
  MarketingCampaignDetail,
  MarketingEmailContent,
  MarketingTemplate,
  MarketingTemplateInput,
} from "@/lib/marketing/types";
import { DEFAULT_MARKETING_FILTERS } from "@/lib/marketing/types";
import MarketingAudienceReview from "@/components/admin/MarketingAudienceReview";
import AdminPromotionsView from "@/components/admin/AdminPromotionsView";
import AdminSelect from "@/components/admin/AdminSelect";
import BrandLogo from "@/components/brand/BrandLogo";
import type { AdminCustomerDirectoryEntry } from "@/lib/customers/types";
import type { AdminPromotion } from "@/lib/promotions/types";
import type { ServiceRecord } from "@/lib/services/types";

type Props = {
  templates: MarketingTemplate[];
  campaigns: MarketingCampaign[];
  subscribers: number;
  campaignsSent: number;
  emailsSent: number;
  activeServices: string[];
  services: ServiceRecord[];
  promotions: AdminPromotion[];
  customers: AdminCustomerDirectoryEntry[];
};

const emptyContent: MarketingEmailContent = { campaignName: "", templateId: null, subject: "", preheader: "", headline: "", content: "", ctaText: "", ctaUrl: "" };
const emptyTemplate: MarketingTemplateInput = { name: "", description: "", subject: "", preheader: "", headline: "", content: "", ctaText: "", ctaUrl: "" };

function getTemplateInput(template: MarketingTemplate): MarketingTemplateInput {
  return { german: { name: template.name_de ?? "", description: template.description_de ?? "", subject: template.default_subject_de ?? "", preheader: template.default_preheader_de ?? "", headline: template.default_headline_de ?? "", content: template.default_content_de ?? "", ctaText: template.default_cta_text_de ?? "" }, name: template.name, description: template.description ?? "", subject: template.default_subject, preheader: template.default_preheader ?? "", headline: template.default_headline, content: template.default_content, ctaText: template.default_cta_text ?? "", ctaUrl: template.default_cta_url ?? "" };
}

function formatDate(value: string | null, locale: string = "de") {
  if (!value) return "Not sent";
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone: "Europe/Zurich", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function EmailPreview({ content, emptyHeadline = "Add a clear campaign headline", emptyContent = "Write the message your customers will receive." }: { content: MarketingEmailContent; emptyHeadline?: string; emptyContent?: string }) {
  const ui = useTranslations("ui");

  return <div className="overflow-hidden border border-border bg-[#0b0b0b] shadow-2xl"><div className="border-b border-[#292929] px-7 py-7"><BrandLogo className="h-6 w-32" /></div><div className="px-7 py-9"><p className="text-[9px] uppercase tracking-[0.22em] text-accent">1200 Hairstudio</p><h3 className={`mt-3 whitespace-pre-wrap font-admin-display text-3xl font-semibold leading-tight ${content.headline ? "text-[#f5f2ec]" : "text-[#77736d]"}`}>{content.headline || emptyHeadline}</h3><div className={`mt-6 whitespace-pre-wrap font-admin-primary text-sm leading-7 ${content.content ? "text-[#b7b4ae]" : "text-[#77736d]"}`}>{content.content || emptyContent}</div>{content.ctaText ? <span className="mt-7 inline-flex min-h-12 items-center bg-accent px-6 font-admin-primary text-[10px] font-bold uppercase tracking-[0.18em] text-background">{content.ctaText}</span> : null}</div><div className="border-t border-[#292929] px-7 py-6 font-admin-primary text-[10px] leading-5 text-[#77736d]">1200 Hairstudio · Schulstrasse 2 · 8599 Salmsach<br />{ui("md6b699f7f0c0")}<br /><span className="underline">{ui("m5d82386211e4")}</span></div></div>;
}

function Field({ label, value, onChange, multiline, placeholder }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean; placeholder?: string }) {
  const interfaceLocale = useInterfaceLocale();
  const displayText = (value: string) => interfaceText(interfaceLocale, value);

  const classes = "mt-2 w-full border border-border bg-background px-4 py-3 font-admin-primary text-sm text-foreground outline-none transition-colors focus:border-accent";
  return <label className="block"><span className="font-admin-primary text-[10px] uppercase tracking-[0.18em] text-foreground-muted">{displayText(label)}</span>{multiline ? <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={8} className={`${classes} resize-y`} /> : <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={classes} />}</label>;
}

export default function AdminMarketingView({ templates, campaigns, subscribers, campaignsSent, emailsSent, activeServices, services, promotions, customers }: Props) {
  const locale = useLocale();
  const { locale: contentLocale } = useAdminContentLocale();
  const copy = useTranslations("contentEditor");
  const audit = useTranslations("audit");

  const uiText = useUiText();

  const ui = useTranslations("ui");

  const router = useRouter();
  const [activeSection, setActiveSection] = useState<"campaigns" | "templates" | "promotions">("campaigns");
  const [isCreating, setIsCreating] = useState(false);
  const [step, setStep] = useState(1);
  const [content, setContent] = useState<MarketingEmailContent>(emptyContent);
  const [hasStartedDraft, setHasStartedDraft] = useState(false);
  const [filters, setFilters] = useState<MarketingAudienceFilters>(DEFAULT_MARKETING_FILTERS);
  const [campaignId, setCampaignId] = useState<string>();
  const [campaignPromotionId, setCampaignPromotionId] = useState("");
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string }>();
  const [detail, setDetail] = useState<MarketingCampaignDetail | null>(null);
  const [templateEditor, setTemplateEditor] = useState<{ id?: string; values: MarketingTemplateInput; returnToCampaign: boolean } | null>(null);
  const [isPending, startTransition] = useTransition();
  const templateNameById = useMemo(() => new Map(templates.map((template) => [template.id, template.name])), [templates]);
  const selectedTemplate = useMemo(() => templates.find((template) => template.id === content.templateId) ?? null, [content.templateId, templates]);

  useEffect(() => {
    if (!detail) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [detail]);
  const editorPlaceholders = selectedTemplate ? {
    subject: audit("campaignSubjectPlaceholder", { name: selectedTemplate.name }),
    preheader: audit("campaignPreheaderPlaceholder", { name: selectedTemplate.name }),
    headline: audit("campaignHeadlinePlaceholder", { name: selectedTemplate.name }),
    content: audit("campaignBodyPlaceholder", { name: selectedTemplate.name }),
    ctaText: selectedTemplate.default_cta_text ? "" : "CTA text (Optional)",
    ctaUrl: "https://example.com (Optional)",
  } : {
    subject: "e.g. A fresh update from 1200 Hairstudio",
    preheader: "Preheader (Optional)",
    headline: "Add a clear headline for this campaign",
    content: "Write the marketing message your customers will receive",
    ctaText: "CTA text (Optional)",
    ctaUrl: "https://example.com (Optional)",
  };

  function resetCampaign() { setIsCreating(false); setStep(1); setContent(emptyContent); setHasStartedDraft(false); setFilters(DEFAULT_MARKETING_FILTERS); setCampaignId(undefined); setCampaignPromotionId(""); router.refresh(); }
  function selectTemplate(template: MarketingTemplate | null) {
    const nextTemplateId = template?.id ?? null;
    if (hasStartedDraft) {
      if (content.templateId === nextTemplateId) {
        setStep(2);
        return true;
      }
      if (!window.confirm(uiText("Changing the template will replace the current email content. Continue?"))) return false;
    }
    setContent({ translations: { de: { subject: template?.default_subject_de ?? "", preheader: template?.default_preheader_de ?? "", headline: template?.default_headline_de ?? "", content: template?.default_content_de ?? "", ctaText: template?.default_cta_text_de ?? "" } }, campaignName: template?.name ?? "Custom Campaign", templateId: template?.id ?? null, subject: template?.default_subject ?? "", preheader: template?.default_preheader ?? "", headline: template?.default_headline ?? "", content: template?.default_content ?? "", ctaText: template?.default_cta_text ?? "", ctaUrl: template?.default_cta_url ?? "" }); setStep(2);
    setHasStartedDraft(true);
    return true;
  }
  function update<K extends keyof MarketingEmailContent>(key: K, value: MarketingEmailContent[K]) { setContent(current => contentLocale === "de" && ["subject", "preheader", "headline", "content", "ctaText"].includes(key) ? { ...current, translations: { de: { subject: "", preheader: "", headline: "", content: "", ctaText: "", ...current.translations?.de, [key]: value } } } : { ...current, [key]: value }); }
  const campaignCopy = (key: "subject" | "preheader" | "headline" | "content" | "ctaText") => contentLocale === "de" ? content.translations?.de?.[key] ?? "" : content[key];
  function run(action: () => Promise<{ success: boolean; message: string; campaignId?: string }>, after?: () => void) { startTransition(async () => { const result = await action(); setMessage({ kind: result.success ? "success" : "error", text: result.message }); if (result.campaignId) setCampaignId(result.campaignId); if (result.success) after?.(); }); }
  function loadAudience() { setStep(4); }
  function openDraft(campaign: MarketingCampaign, reviewFirst: boolean) {
    const draftFilters: MarketingAudienceFilters = {
      ...DEFAULT_MARKETING_FILTERS,
      ...(campaign.audience_filters ?? {}),
      statuses: Array.isArray(campaign.audience_filters?.statuses) ? campaign.audience_filters.statuses : [],
    };
    setContent({ translations: campaign.audience_filters?.localized_content, campaignName: campaign.name, templateId: campaign.template_id, subject: campaign.subject, preheader: campaign.preheader ?? "", headline: campaign.headline, content: campaign.content, ctaText: campaign.cta_text ?? "", ctaUrl: campaign.cta_url ?? "" });
    setFilters(draftFilters);
    setCampaignId(campaign.id);
    setHasStartedDraft(true);
    setMessage(undefined);
    setIsCreating(true);
    if (reviewFirst) {
      setStep(4);
    } else {
      setStep(2);
    }
  }
  function startCampaignFromTemplate(template: MarketingTemplate) {
    if (!selectTemplate(template)) return;
    setActiveSection("campaigns");
    setMessage(undefined);
    setIsCreating(true);
  }
  function updateTemplateField<K extends keyof MarketingTemplateInput>(key: K, value: MarketingTemplateInput[K]) {
    setTemplateEditor((current) => current ? { ...current, values: { ...current.values, ...(key === "ctaUrl" ? { [key]: value } : draftChange(key, String(value), contentLocale, current.values)) } } : current);
  }

  if (templateEditor) {
    const displayed = { ...templateEditor.values, ...Object.fromEntries(["name", "description", "subject", "preheader", "headline", "content", "ctaText"].map(key => [key, draftText(templateEditor.values, key, templateEditor.values[key as "name"], contentLocale)])) };
    const previewContent: MarketingEmailContent = { campaignName: displayed.name, templateId: templateEditor.id ?? null, subject: displayed.subject, preheader: displayed.preheader, headline: displayed.headline, content: displayed.content, ctaText: displayed.ctaText, ctaUrl: displayed.ctaUrl };
    return <section><button type="button" onClick={() => setTemplateEditor(null)} className="inline-flex min-h-11 items-center gap-2 font-admin-primary text-[10px] uppercase tracking-[.16em] text-foreground-secondary hover:text-accent"><ChevronLeft size={15} /> {" "}{ui("m32ded662f33d")}</button><div className="mt-4 flex flex-wrap items-end justify-between gap-4"><div><p className="text-[10px] uppercase tracking-[.2em] text-accent">{ui("m289b4c1b31ba")}</p><h1 className="mt-2 font-admin-display text-3xl font-semibold text-foreground">{uiText(templateEditor.id ? "Edit Template" : "Create Template")}</h1></div></div><ContentLanguageSwitcher />{message ? <div className={`mt-5 border px-4 py-3 text-sm ${message.kind === "success" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-red-500/30 bg-red-500/10 text-red-300"}`}>{uiText(message.text)}</div> : null}<div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,.82fr)]"><div className="border border-border bg-surface p-5 sm:p-7"><div className="grid gap-5 sm:grid-cols-2"><Field label={ui("m954ab955f2a4")} value={draftText(templateEditor.values, "name", displayed.name, contentLocale)} onChange={(value) => updateTemplateField("name", value)} placeholder={ui("m89ddfad95d94")} /><Field label={ui("m8d183dbdcea3")} value={draftText(templateEditor.values, "subject", displayed.subject, contentLocale)} onChange={(value) => updateTemplateField("subject", value)} placeholder={ui("mb8e4c89724c8")} /></div><div className="mt-5"><Field label={ui("m55f8ebc805e6")} value={draftText(templateEditor.values, "description", displayed.description, contentLocale)} onChange={(value) => updateTemplateField("description", value)} multiline placeholder={ui("mf1da5c02d4ea")} /></div><div className="mt-5"><Field label={ui("m5718d6737358")} value={draftText(templateEditor.values, "preheader", displayed.preheader, contentLocale)} onChange={(value) => updateTemplateField("preheader", value)} placeholder={ui("m6aa7634050e1")} /></div><div className="mt-5"><Field label={ui("m442250df38e5")} value={draftText(templateEditor.values, "headline", displayed.headline, contentLocale)} onChange={(value) => updateTemplateField("headline", value)} placeholder={ui("m2b4411952881")} /></div><div className="mt-5"><Field label={ui("m4f9be057f0ea")} value={draftText(templateEditor.values, "content", displayed.content, contentLocale)} onChange={(value) => updateTemplateField("content", value)} multiline placeholder={ui("m8b53d580bc1c")} /></div><div className="mt-5 grid gap-5 sm:grid-cols-2"><Field label={ui("mdd7d462d081d")} value={draftText(templateEditor.values, "ctaText", displayed.ctaText, contentLocale)} onChange={(value) => updateTemplateField("ctaText", value)} placeholder={ui("m88d19e98b648")} /><Field label={ui("mec1f64c1fa90")} value={displayed.ctaUrl} onChange={(value) => updateTemplateField("ctaUrl", value)} placeholder={ui("mf80014f90e7c")} /></div><div className="mt-7 flex justify-end gap-3"><button type="button" onClick={() => setTemplateEditor(null)} className="min-h-11 border border-border px-5 text-[10px] uppercase tracking-[.16em] text-foreground">{ui("m77dfd2135f4d")}</button><button type="button" disabled={isPending} onClick={() => startTransition(async () => { const result = await saveMarketingTemplate(templateEditor.values, templateEditor.id, contentLocale); setMessage({ kind: result.success ? "success" : "error", text: result.success ? copy("saved", { language: contentLocale.toUpperCase() }) : `${copy("failed", { language: contentLocale.toUpperCase() })} ${uiText(result.message)}` }); if (result.success) { setTemplateEditor(current => current ? { ...current, id: result.templateId ?? current.id } : current); router.refresh(); } })} className="min-h-11 bg-accent px-6 text-[10px] font-semibold uppercase tracking-[.16em] text-background disabled:opacity-50">{uiText(isPending ? "Saving…" : "Save Template")}</button></div></div><div className="xl:sticky xl:top-6 xl:self-start"><p className="mb-3 text-[10px] uppercase tracking-[.18em] text-foreground-muted">{ui("m131a90af8eec")}</p><EmailPreview content={previewContent} /></div></div></section>;
  }

  if (isCreating) return <section className="space-y-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><button type="button" onClick={resetCampaign} className="inline-flex items-center gap-2 font-admin-primary text-xs uppercase tracking-[0.16em] text-foreground-secondary hover:text-foreground"><ChevronLeft size={15} /> {" "}{ui("me0c534a05742")}</button><h1 className="mt-3 font-admin-display text-3xl font-semibold text-foreground">{uiText(campaignId ? "Edit Campaign Draft" : "New Campaign")}</h1></div><div className="flex items-center gap-2">{["Template", "Create Email", "Review & Send"].map((label, index) => <div key={label} className={`border px-3 py-2 font-admin-primary text-[9px] uppercase tracking-[0.15em] ${(step === 4 ? 3 : step) === index + 1 ? "border-accent bg-accent/10 text-accent" : "border-border text-foreground-muted"}`}>{index + 1}. {uiText(label)}</div>)}</div></div>
    {step === 4 ? <MarketingAudienceReview content={content} filters={filters} activeServices={activeServices} serviceLabels={Object.fromEntries(services.map(service => [service.source_name ?? service.name, service.name]))} campaignId={campaignId} preview={<EmailPreview content={content} />} onFiltersChange={setFilters} onBack={() => setStep(2)} onMessage={(kind, text) => setMessage({ kind, text })} onComplete={(text) => { setMessage({ kind: "success", text }); resetCampaign(); }} /> : null}
    {message ? <div className={`border px-4 py-3 font-admin-primary text-sm ${message.kind === "success" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-red-500/30 bg-red-500/10 text-red-300"}`}>{uiText(message.text)}</div> : null}
    {step === 1 ? <div><p className="max-w-2xl font-admin-primary text-sm leading-6 text-foreground-secondary">{ui("m2933c9e5a424")}</p><div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{templates.map((template) => <button key={template.id} type="button" onClick={() => selectTemplate(template)} className="group min-h-52 border border-border bg-surface p-6 text-left transition-all hover:-translate-y-0.5 hover:border-accent/60"><p className="font-admin-primary text-[10px] uppercase tracking-[0.2em] text-accent">{ui("m19fce65389ab")}</p><h2 className="mt-5 font-admin-display text-xl font-semibold text-foreground">{template.name}</h2><p className="mt-3 font-admin-primary text-sm leading-6 text-foreground-secondary">{template.description ?? uiText("Start with this campaign layout and customize the message.")}</p>{template.default_headline ? <p className="mt-4 border-l border-accent/40 pl-3 font-admin-primary text-xs leading-5 text-foreground-muted">{template.default_headline}</p> : null}{template.default_cta_text ? <span className="mt-4 inline-flex border border-border px-2 py-1 font-admin-primary text-[9px] uppercase tracking-[0.12em] text-foreground-secondary">{template.default_cta_text}</span> : null}<span className="mt-6 flex items-center gap-2 font-admin-primary text-[10px] uppercase tracking-[0.16em] text-foreground group-hover:text-accent">{ui("m66e659531c60")}{" "}<ChevronRight size={14} /></span></button>)}<button type="button" onClick={() => selectTemplate(null)} className="min-h-52 border border-dashed border-border bg-background-secondary p-6 text-left transition-colors hover:border-accent"><p className="font-admin-primary text-[10px] uppercase tracking-[0.2em] text-accent">{ui("m15a9d3fda2e1")}</p><h2 className="mt-5 font-admin-display text-xl font-semibold text-foreground">{ui("m832e8440b6f1")}</h2><p className="mt-3 font-admin-primary text-sm leading-6 text-foreground-secondary">{ui("m01d8ca934d1d")}</p></button></div></div> : null}
    {step === 2 ? <ContentLanguageSwitcher /> : null}
    {step === 2 ? <div><button type="button" onClick={() => setStep(1)} className="mb-4 inline-flex min-h-11 items-center gap-2 border border-transparent px-1 font-admin-primary text-[10px] uppercase tracking-[0.16em] text-foreground-secondary transition-colors hover:text-accent"><ChevronLeft size={15} /> {" "}{ui("m32ded662f33d")}</button><div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,.82fr)]"><div className="border border-border bg-surface p-5 sm:p-7"><div className="grid gap-5 sm:grid-cols-2"><Field label={ui("maa5d0e720b4b")} value={content.campaignName} onChange={(value) => update("campaignName", value)} placeholder={ui("m10450d4400ea")} /><Field label={ui("m8d183dbdcea3")} value={campaignCopy("subject")} onChange={(value) => update("subject", value)} placeholder={editorPlaceholders.subject} /></div><div className="mt-5"><Field label={ui("m5718d6737358")} value={campaignCopy("preheader")} onChange={(value) => update("preheader", value)} placeholder={editorPlaceholders.preheader} /></div><div className="mt-5"><Field label={ui("m442250df38e5")} value={campaignCopy("headline")} onChange={(value) => update("headline", value)} placeholder={editorPlaceholders.headline} /></div><div className="mt-5"><Field label={ui("m3c4de1dc5045")} value={campaignCopy("content")} onChange={(value) => update("content", value)} multiline placeholder={editorPlaceholders.content} /></div><div className="mt-5 grid gap-5 sm:grid-cols-2"><Field label={ui("mdd7d462d081d")} value={campaignCopy("ctaText")} onChange={(value) => update("ctaText", value)} placeholder={editorPlaceholders.ctaText} /><Field label={ui("mec1f64c1fa90")} value={content.ctaUrl} onChange={(value) => update("ctaUrl", value)} placeholder={editorPlaceholders.ctaUrl} /></div><div className="mt-7 flex flex-wrap gap-3"><button disabled={isPending} onClick={() => run(async () => { const result = await saveMarketingDraft(content, filters, campaignId, contentLocale); return { ...result, message: result.success ? copy("saved", { language: contentLocale.toUpperCase() }) : `${copy("failed", { language: contentLocale.toUpperCase() })} ${uiText(result.message)}` }; })} className="min-h-11 border border-border px-5 text-[10px] uppercase tracking-[.16em] text-foreground disabled:opacity-50">{ui("mcc1316dd1928")}</button><button disabled={isPending} onClick={() => setTemplateEditor({ values: { german: { name: "", description: "", ...content.translations?.de }, name: content.campaignName, description: "", subject: content.subject, preheader: content.preheader, headline: content.headline, content: content.content, ctaText: content.ctaText, ctaUrl: content.ctaUrl }, returnToCampaign: true })} className="min-h-11 border border-border px-5 text-[10px] uppercase tracking-[.16em] text-foreground disabled:opacity-50">{ui("m18ea0c6cf864")}</button><button disabled={isPending} onClick={() => run(() => sendMarketingTest(content))} className="min-h-11 border border-border px-5 text-[10px] uppercase tracking-[.16em] text-foreground disabled:opacity-50">{ui("mf2c6c5be4c10")}</button><button disabled={isPending} onClick={loadAudience} className="ml-auto min-h-11 bg-accent px-6 text-[10px] font-semibold uppercase tracking-[.16em] text-background disabled:opacity-50">{ui("m2e02623966f9")}</button></div></div><div className="xl:sticky xl:top-6 xl:self-start"><p className="mb-3 text-[10px] uppercase tracking-[.18em] text-foreground-muted">{ui("m131a90af8eec")}</p><EmailPreview content={{ ...content, subject: campaignCopy("subject"), preheader: campaignCopy("preheader"), headline: campaignCopy("headline"), content: campaignCopy("content"), ctaText: campaignCopy("ctaText") }} emptyHeadline={editorPlaceholders.headline} emptyContent={editorPlaceholders.content} /></div></div></div> : null}
    {step === 2 ? <div className="border border-border bg-surface p-5 sm:p-7"><AdminSelect label={ui("m4ddfa6e353b3")} value={campaignPromotionId} onChange={setCampaignPromotionId} options={[{ value: "", label: "No Promotion" }, ...promotions.filter((promotion) => promotion.is_active && (!promotion.expires_at || new Date(promotion.expires_at).getTime() > Date.now())).map((promotion) => ({ value: promotion.id, label: `${promotion.discount_type === "percentage" ? `${promotion.discount_value}% Off` : `CHF ${promotion.discount_value} Off`} — ${promotion.name}` }))]} />{campaignPromotionId ? (() => { const promotion = promotions.find((item) => item.id === campaignPromotionId); return promotion ? <div className="mt-4 border-l border-accent/50 pl-4 text-xs leading-6 text-foreground-secondary"><p>{promotion.service_name ?? uiText("All services")} · {uiText(promotion.audience_type.replaceAll("_", " "))}</p><p>{ui("m081ecd744314")}{" "}{formatDate(promotion.expires_at, locale)}</p><p className="text-amber-300">{ui("m2527f1ef0f1c")}</p></div> : null; })() : null}</div> : null}
    </section>;

  const draftCampaigns = campaigns.filter((campaign) => campaign.status === "draft");
  const sectionTabs = <><div className="mt-7 flex overflow-x-auto border-b border-border">{(["campaigns", "templates", "promotions"] as const).map((section) => <button key={section} type="button" onClick={() => setActiveSection(section)} className={`min-h-11 shrink-0 border-b-2 px-5 text-[10px] uppercase tracking-[.18em] ${activeSection === section ? "border-accent text-accent" : "border-transparent text-foreground-muted"}`}>{uiText(section)}</button>)}</div>{activeSection === "campaigns" && draftCampaigns.length ? <div className="mt-6 border border-accent/25 bg-accent/[0.04]"><div className="border-b border-border px-5 py-4"><p className="font-admin-primary text-[10px] uppercase tracking-[.18em] text-accent">{ui("m4370efafaf0f")}{" "}{draftCampaigns.length}</p></div>{draftCampaigns.map((campaign) => <div key={campaign.id} className="flex flex-col gap-4 border-b border-border px-5 py-4 last:border-0 sm:flex-row sm:items-center sm:justify-between"><button type="button" onClick={() => openDraft(campaign, false)} className="min-w-0 text-left"><span className="block truncate text-sm text-foreground hover:text-accent">{campaign.name}</span><span className="mt-1 block truncate text-xs text-foreground-muted">{campaign.subject}</span></button><div className="flex flex-wrap gap-2"><button type="button" onClick={() => openDraft(campaign, false)} className="min-h-10 border border-border px-3 text-[9px] uppercase tracking-[.12em] text-foreground">{ui("m64d64e86d269")}</button><button type="button" onClick={() => openDraft(campaign, true)} className="min-h-10 bg-accent px-4 text-[9px] font-semibold uppercase tracking-[.12em] text-background">{ui("m9bc2575c3930")}</button><button type="button" disabled={isPending} onClick={() => { if (!window.confirm(uiText("Delete this campaign draft? This does not affect its source template."))) return; startTransition(async () => { const result = await deleteMarketingDraft(campaign.id); setMessage({ kind: result.success ? "success" : "error", text: result.message }); if (result.success) router.refresh(); }); }} className="min-h-10 border border-red-500/30 px-3 text-[9px] uppercase tracking-[.12em] text-red-300 disabled:opacity-50">{ui("mf6fdbe48dc54")}</button></div></div>)}</div> : null}</>;
  if (activeSection === "promotions") return <section><div><p className="text-[10px] uppercase tracking-[.22em] text-foreground-muted">{ui("mfa0ae1ff16e8")}</p><h1 className="mt-2 font-admin-display text-3xl font-semibold text-foreground sm:text-4xl">{ui("me0c534a05742")}</h1></div>{uiText(sectionTabs)}<div className="mt-7"><AdminPromotionsView promotions={promotions} services={services} customers={customers} /></div></section>;
  if (activeSection === "templates") return <section><div className="flex flex-wrap items-end justify-between gap-5"><div><p className="text-[10px] uppercase tracking-[.22em] text-foreground-muted">{ui("m7d38d48d858c")}</p><h1 className="mt-2 font-admin-display text-3xl font-semibold text-foreground sm:text-4xl">{ui("me0c534a05742")}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-foreground-secondary">{ui("mab2db3f5451d")}</p></div><button type="button" onClick={() => { setMessage(undefined); setTemplateEditor({ values: emptyTemplate, returnToCampaign: false }); }} className="min-h-12 bg-accent px-6 text-[10px] font-semibold uppercase tracking-[.18em] text-background">{ui("mb2acbc5a0781")}</button></div>{uiText(sectionTabs)}{message ? <div className={`mt-6 border px-4 py-3 text-sm ${message.kind === "success" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-red-500/30 bg-red-500/10 text-red-300"}`}>{uiText(message.text)}</div> : null}<div className="mt-7 grid gap-6 lg:grid-cols-2 2xl:grid-cols-3">{templates.map((template) => { const preview = getTemplateInput(template); return <article key={template.id} className="border border-border bg-surface p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="font-admin-display text-xl font-semibold text-foreground">{template.name}</h2><p className="mt-2 text-sm leading-6 text-foreground-secondary">{template.description || uiText("No description.")}</p></div>{!template.is_active ? <span className="border border-border px-2 py-1 text-[9px] uppercase tracking-[.14em] text-foreground-muted">{ui("m09af574c7f20")}</span> : null}</div><div className="mt-5 max-h-80 overflow-hidden"><EmailPreview content={{ campaignName: template.name, templateId: template.id, subject: preview.subject, preheader: preview.preheader, headline: preview.headline, content: preview.content, ctaText: preview.ctaText, ctaUrl: preview.ctaUrl }} /></div><div className="mt-5 grid grid-cols-3 gap-2"><button type="button" onClick={() => setTemplateEditor({ id: template.id, values: getTemplateInput(template), returnToCampaign: false })} className="min-h-11 border border-border px-3 text-[9px] uppercase tracking-[.14em] text-foreground hover:border-accent">{ui("m5301648dcf6b")}</button><button type="button" onClick={() => startCampaignFromTemplate(template)} className="min-h-11 bg-accent px-3 text-[9px] font-semibold uppercase tracking-[.14em] text-background">{ui("m23797614964d")}</button><button type="button" disabled={isPending} onClick={() => { if (!window.confirm(uiText("Delete this template? Campaigns previously created from it will not be deleted."))) return; startTransition(async () => { const result = await deleteMarketingTemplate(template.id); setMessage({ kind: result.success ? "success" : "error", text: result.message }); if (result.success) router.refresh(); }); }} className="min-h-11 border border-red-500/30 px-3 text-[9px] uppercase tracking-[.14em] text-red-300 disabled:opacity-50">{ui("mf6fdbe48dc54")}</button></div></article>; })}{!templates.length ? <div className="border border-dashed border-border px-6 py-16 text-center text-sm text-foreground-muted lg:col-span-2">{ui("md02c3485b73b")}</div> : null}</div></section>;
  const summaryCards: Array<[string, number, LucideIcon]> = [["Marketing subscribers", subscribers, Users], ["Campaigns sent", campaignsSent, Send], ["Emails sent", emailsSent, Mail]];
  return <section><div className="flex flex-wrap items-end justify-between gap-5"><div><p className="text-[10px] uppercase tracking-[.22em] text-foreground-muted">{ui("m7d38d48d858c")}</p><h1 className="mt-2 font-admin-display text-3xl font-semibold text-foreground sm:text-4xl">{ui("me0c534a05742")}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-foreground-secondary">{ui("m90e9f91436e5")}</p></div><button onClick={() => { setMessage(undefined); setIsCreating(true); }} className="inline-flex min-h-12 items-center gap-2 bg-accent px-6 text-[10px] font-semibold uppercase tracking-[.18em] text-background">{ui("m5ec1c763e626")}</button></div>{uiText(sectionTabs)}{message ? <div className={`mt-6 border px-4 py-3 font-admin-primary text-sm ${message.kind === "success" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-red-500/30 bg-red-500/10 text-red-300"}`}>{uiText(message.text)}</div> : null}<div className="mt-8 grid gap-4 sm:grid-cols-3">{summaryCards.map(([label, value, Icon]) => <div key={label} className="border border-border bg-surface p-5 sm:p-6"><div className="flex items-start justify-between"><p className="text-[10px] uppercase tracking-[.18em] text-foreground-muted">{uiText(label)}</p><Icon size={17} className="text-accent" /></div><p className="mt-4 font-admin-display text-3xl font-semibold text-foreground">{value}</p></div>)}</div><div className="mt-8 border border-border bg-surface"><div className="flex items-center justify-between border-b border-border px-5 py-5"><div><h2 className="font-admin-display text-xl font-semibold text-foreground">{ui("mb11851a2826d")}</h2><p className="mt-1 text-xs text-foreground-muted">{ui("m45d3ead8f635")}</p></div></div><div className="hidden grid-cols-[minmax(0,1.6fr)_1fr_.7fr_.9fr_.7fr] border-b border-border px-5 py-3 text-[9px] uppercase tracking-[.16em] text-foreground-muted md:grid"><span>{ui("m69390e166570")}</span><span>{ui("m3ec1ae061c27")}</span><span>{ui("mbae7d5be7082")}</span><span>{ui("m35f49dcfbfb2")}</span><span className="text-right">{ui("m78cbf8eb1d8f")}</span></div>{campaigns.map((campaign) => <button key={campaign.id} onClick={() => startTransition(async () => setDetail(await loadMarketingCampaign(campaign.id)))} className="grid w-full gap-2 border-b border-border px-5 py-4 text-left transition-colors last:border-0 hover:bg-background/50 md:grid-cols-[minmax(0,1.6fr)_1fr_.7fr_.9fr_.7fr] md:items-center"><span><span className="block text-sm text-foreground">{campaign.name}</span><span className="mt-1 block text-xs text-foreground-muted md:hidden">{templateNameById.get(campaign.template_id ?? "") ?? uiText("Custom Campaign")}</span></span><span className="hidden text-xs text-foreground-secondary md:block">{templateNameById.get(campaign.template_id ?? "") ?? uiText("Custom Campaign")}</span><span className="w-fit border border-border px-2 py-1 text-[9px] uppercase tracking-[.12em] text-foreground-secondary">{uiText(campaign.status)}</span><span className="text-xs text-foreground-secondary">{formatDate(campaign.sent_at, locale)}</span><span className="text-xs text-foreground md:text-right">{campaign.recipient_count}</span></button>)}{!campaigns.length ? <div className="px-5 py-14 text-center"><Mail className="mx-auto text-foreground-muted" /><p className="mt-4 text-sm text-foreground-secondary">{ui("ma21c7117cc69")}</p></div> : null}</div>
  {detail ? <div className="fixed inset-0 z-50 bg-black/70" onMouseDown={(e) => { if (e.target === e.currentTarget) setDetail(null); }}><aside className="ml-auto h-full w-full max-w-2xl overflow-y-auto border-l border-border bg-background p-5 sm:p-8"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] uppercase tracking-[.2em] text-accent">{detail.template_name}</p><h2 className="mt-2 font-admin-display text-2xl font-semibold text-foreground">{detail.name}</h2><p className="mt-2 text-sm text-foreground-secondary">{formatDate(detail.sent_at, locale)}</p></div><button onClick={() => setDetail(null)} className="inline-flex size-11 items-center justify-center border border-border text-foreground"><X size={18} /></button></div><div className="mt-6 grid grid-cols-3 gap-3">{[["Sent", detail.sent_count], ["Failed", detail.failed_count], ["Skipped", detail.skipped_count]].map(([label, value]) => <div key={String(label)} className="border border-border bg-surface p-4"><p className="text-[9px] uppercase tracking-[.16em] text-foreground-muted">{uiText(label)}</p><p className="mt-2 text-2xl text-foreground">{value}</p></div>)}</div><div className="mt-6"><EmailPreview content={{ campaignName: detail.name, templateId: detail.template_id, subject: detail.subject, preheader: detail.preheader ?? "", headline: detail.headline, content: detail.content, ctaText: detail.cta_text ?? "", ctaUrl: detail.cta_url ?? "" }} /></div><div className="mt-6 border border-border bg-surface"><div className="border-b border-border px-4 py-3 text-[10px] uppercase tracking-[.18em] text-foreground-muted">{ui("me3e7489f2072")}{" "}{detail.recipients.length}</div>{detail.recipients.map((recipient) => <div key={recipient.id} className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3 last:border-0"><div className="min-w-0"><p className="truncate text-sm text-foreground">{recipient.name}</p><p className="truncate text-xs text-foreground-muted">{recipient.email}</p>{recipient.status === "failed" && recipient.failure_reason ? <p className="mt-1 text-xs text-red-300">{recipient.failure_reason}</p> : null}</div><span className="shrink-0 text-[9px] uppercase tracking-[.12em] text-foreground-secondary">{uiText(recipient.status)}</span></div>)}</div></aside></div> : null}</section>;
}
