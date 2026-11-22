"use client";
import { intlLocale } from "@/i18n/config";
import { useLocale } from "next-intl";

import { useUiText } from "@/i18n/use-ui-text";

import { useTranslations } from "next-intl";


import { useMemo, useState, useTransition } from "react";
import { Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { deletePromotion, savePromotion } from "@/app/admin/(dashboard)/marketing/promotions-actions";
import AdminSelect from "@/components/admin/AdminSelect";
import DateTimePicker from "@/components/admin/ui/DateTimePicker";
import TimedEntityStatusBadge from "@/components/admin/TimedEntityStatusBadge";
import type { AdminCustomerDirectoryEntry } from "@/lib/customers/types";
import type { AdminPromotion, PromotionInput } from "@/lib/promotions/types";
import type { ServiceRecord } from "@/lib/services/types";

type Props = { promotions: AdminPromotion[]; services: ServiceRecord[]; customers: AdminCustomerDirectoryEntry[] };
const emptyForm: PromotionInput = { name: "", discountType: "percentage", discountValue: 10, appliesTo: "all_services", serviceId: null, audienceType: "all_customers", startsAt: "", expiresAt: "", maxUsesPerCustomer: 1, isActive: true, customerIds: [] };

function localInputValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

function formatDate(value: string | null, locale: string = "de") {
  return value ? new Intl.DateTimeFormat(intlLocale(locale), { timeZone: "Europe/Zurich", day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "No limit";
}

function discountLabel(promotion: AdminPromotion) {
  return promotion.discount_type === "percentage" ? `${promotion.discount_value}%` : `CHF ${promotion.discount_value.toFixed(2)}`;
}

export default function AdminPromotionsView({ promotions, services, customers }: Props) {
  const locale = useLocale();

  const uiText = useUiText();

  const ui = useTranslations("ui");

  const router = useRouter();
  const [editing, setEditing] = useState<{ id?: string; form: PromotionInput } | null>(null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string }>();
  const [isPending, startTransition] = useTransition();
  const visibleCustomers = useMemo(() => {
    const query = customerQuery.trim().toLowerCase();
    return customers.filter((customer) => !customer.id.startsWith("legacy-guest:") && (!query || `${customer.full_name} ${customer.email}`.toLowerCase().includes(query)));
  }, [customerQuery, customers]);

  function editPromotion(promotion: AdminPromotion) {
    setEditing({ id: promotion.id, form: { name: promotion.name, discountType: promotion.discount_type, discountValue: promotion.discount_value, appliesTo: promotion.service_id === null ? "all_services" : "specific_service", serviceId: promotion.service_id, audienceType: promotion.audience_type, startsAt: localInputValue(promotion.starts_at), expiresAt: localInputValue(promotion.expires_at), maxUsesPerCustomer: promotion.max_uses_per_customer ?? 1, isActive: promotion.is_active, customerIds: promotion.customer_ids } });
    setMessage(undefined);
  }
  function update<K extends keyof PromotionInput>(key: K, value: PromotionInput[K]) {
    setEditing((current) => current ? { ...current, form: { ...current.form, [key]: value } } : current);
  }
  function toggleCustomer(id: string) {
    if (!editing) return;
    update("customerIds", editing.form.customerIds.includes(id) ? editing.form.customerIds.filter((item) => item !== id) : [...editing.form.customerIds, id]);
  }

  if (editing) return <section><button type="button" onClick={() => setEditing(null)} className="inline-flex min-h-11 items-center gap-2 text-[10px] uppercase tracking-[.16em] text-foreground-secondary hover:text-accent"><X size={15} /> {" "}{ui("m3adaf6db45ad")}</button><div className="mt-4"><p className="text-[10px] uppercase tracking-[.2em] text-accent">{ui("m5381442dad79")}</p><h2 className="mt-2 font-admin-display text-3xl font-semibold text-foreground">{uiText(editing.id ? "Edit Promotion" : "Create Promotion")}</h2></div>{message ? <div className={`mt-5 border px-4 py-3 text-sm ${message.kind === "success" ? "border-emerald-500/30 text-emerald-300" : "border-red-500/30 text-red-300"}`}>{uiText(message.text)}</div> : null}<div className="mt-6 border border-border bg-surface p-5 sm:p-7"><div className="grid gap-5 md:grid-cols-2"><label className="block"><span className="text-[10px] uppercase tracking-[.16em] text-foreground-muted">{ui("m5a5757263664")}</span><input value={editing.form.name} onChange={(event) => update("name", event.target.value)} className="mt-2 min-h-11 w-full border border-border bg-background px-4 text-sm text-foreground outline-none focus:border-accent" /></label><AdminSelect label={ui("mc5137ddde86c")} value={editing.form.discountType} onChange={(value) => update("discountType", value as PromotionInput["discountType"])} options={[{ value: "percentage", label: "Percentage" }, { value: "fixed", label: "Fixed CHF" }]} /><label className="block"><span className="text-[10px] uppercase tracking-[.16em] text-foreground-muted">{ui("mcfbd2d59622d")}</span><input type="number" min="0.01" max={editing.form.discountType === "percentage" ? 100 : undefined} step="0.01" value={editing.form.discountValue} onChange={(event) => update("discountValue", Number(event.target.value))} className="mt-2 min-h-11 w-full border border-border bg-background px-4 text-sm text-foreground outline-none focus:border-accent" /></label><AdminSelect label={ui("m0c9d314d2bc3")} value={editing.form.appliesTo} onChange={(value) => update("appliesTo", value as PromotionInput["appliesTo"])} options={[{ value: "all_services", label: "All Services" }, { value: "specific_service", label: "Specific Service" }]} />{editing.form.appliesTo === "specific_service" ? <AdminSelect label={ui("m329cb8b6ba8c")} value={editing.form.serviceId ?? ""} onChange={(value) => update("serviceId", value)} searchable={services.length > 8} placeholder={ui("mf216b2305e94")} options={services.map((service) => ({ value: service.id, label: service.name, localize: false }))} /> : null}<AdminSelect label={ui("m51d9934555e2")} value={editing.form.audienceType} onChange={(value) => update("audienceType", value as PromotionInput["audienceType"])} options={[{ value: "selected_customers", label: "Selected Customers" }, { value: "all_customers", label: "All Customers" }, { value: "registered_customers", label: "Registered Customers Only" }]} /><DateTimePicker mode="datetime" minuteStep={5} label={ui("mfc612a2fcc72")} value={editing.form.startsAt} onChange={(nextValue) => update("startsAt", nextValue)} clearable placeholder={ui("mb5f2d3b365d5")} /><DateTimePicker mode="datetime" minuteStep={5} label={ui("ma99be3da0c9d")} value={editing.form.expiresAt} onChange={(nextValue) => update("expiresAt", nextValue)} minDate={editing.form.startsAt.slice(0, 10) || undefined} clearable placeholder={ui("m820b15864313")} />{editing.form.audienceType === "all_customers" ? <div className="border border-accent/25 bg-accent/[0.05] px-4 py-3 text-xs leading-5 text-foreground-secondary">{ui("mf72fca0ee109")}</div> : <label className="block"><span className="text-[10px] uppercase tracking-[.16em] text-foreground-muted">{ui("m967b2953668a")}</span><input type="number" min="1" step="1" value={editing.form.maxUsesPerCustomer} onChange={(event) => update("maxUsesPerCustomer", Number(event.target.value))} className="mt-2 min-h-11 w-full border border-border bg-background px-4 text-sm text-foreground outline-none focus:border-accent" /></label>}<AdminSelect label={ui("mbae7d5be7082")} value={editing.form.isActive ? "active" : "inactive"} onChange={(value) => update("isActive", value === "active")} options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} /></div>{editing.form.audienceType === "selected_customers" ? <div className="mt-6 border border-border bg-background/40"><div className="border-b border-border p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center"><div className="flex min-h-11 flex-1 items-center gap-2 border border-border bg-background px-3"><Search size={15} className="text-foreground-muted" /><input value={customerQuery} onChange={(event) => setCustomerQuery(event.target.value)} placeholder={ui("m5d12419516ef")} className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none" /></div><button type="button" onClick={() => update("customerIds", Array.from(new Set([...editing.form.customerIds, ...visibleCustomers.map((customer) => customer.id)])))} className="min-h-11 border border-border px-4 text-[9px] uppercase tracking-[.14em] text-foreground">{ui("m8afc6989b94f")}</button><button type="button" onClick={() => update("customerIds", [])} className="min-h-11 border border-border px-4 text-[9px] uppercase tracking-[.14em] text-foreground">{ui("m719ea396ad92")}</button></div><p className="mt-3 text-xs text-accent">{editing.form.customerIds.length} {" "}{ui("m835f3b50e337")}</p></div><div className="max-h-72 overflow-y-auto">{visibleCustomers.map((customer) => <label key={customer.id} className="flex min-h-14 cursor-pointer items-center gap-3 border-b border-border/70 px-4 py-3 last:border-0 hover:bg-surface"><input type="checkbox" checked={editing.form.customerIds.includes(customer.id)} onChange={() => toggleCustomer(customer.id)} className="size-5 accent-[#d8b174]" /><span className="min-w-0"><span className="block truncate text-sm text-foreground">{customer.full_name}</span><span className="block truncate text-xs text-foreground-muted">{customer.email}</span></span></label>)}</div></div> : null}<div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" onClick={() => setEditing(null)} className="min-h-11 border border-border px-5 text-[10px] uppercase tracking-[.16em] text-foreground">{ui("m77dfd2135f4d")}</button><button type="button" disabled={isPending} onClick={() => startTransition(async () => { const result = await savePromotion(editing.form, editing.id); setMessage({ kind: result.success ? "success" : "error", text: result.message }); if (result.success) { setEditing(null); router.refresh(); } })} className="min-h-11 bg-accent px-6 text-[10px] font-semibold uppercase tracking-[.16em] text-background disabled:opacity-50">{uiText(isPending ? "Saving…" : "Save Promotion")}</button></div></div></section>;

  return <section>{message ? <div className={`mb-5 border px-4 py-3 text-sm ${message.kind === "success" ? "border-emerald-500/30 text-emerald-300" : "border-red-500/30 text-red-300"}`}>{uiText(message.text)}</div> : null}<div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="font-admin-display text-2xl font-semibold text-foreground">{ui("m086e09b4b6b7")}</h2><p className="mt-2 text-sm text-foreground-secondary">{ui("me275cbd0fb26")}</p></div><button type="button" onClick={() => { setEditing({ form: emptyForm }); setMessage(undefined); }} className="inline-flex min-h-11 items-center gap-2 bg-accent px-5 text-[10px] font-semibold uppercase tracking-[.16em] text-background"><Plus size={15} /> {" "}{ui("m4802c44091db")}</button></div><div className="mt-6 grid gap-4 lg:grid-cols-2">{promotions.map((promotion) => <article key={promotion.id} className="border border-border bg-surface p-5"><div className="flex items-start justify-between gap-4"><div><h3 className="font-admin-display text-xl font-semibold text-foreground">{promotion.name}</h3><p className="mt-2 text-2xl text-accent">{discountLabel(promotion)}</p></div><TimedEntityStatusBadge entity={promotion} /></div><dl className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-4 text-xs"><div><dt className="uppercase tracking-[.14em] text-foreground-muted">{ui("m329cb8b6ba8c")}</dt><dd className="mt-1 text-foreground-secondary">{promotion.service_name ?? uiText("All services")}</dd></div><div><dt className="uppercase tracking-[.14em] text-foreground-muted">{ui("m51d9934555e2")}</dt><dd className="mt-1 text-foreground-secondary">{uiText(promotion.audience_type.replaceAll("_", " "))}</dd></div><div><dt className="uppercase tracking-[.14em] text-foreground-muted">{ui("mfc612a2fcc72")}</dt><dd className="mt-1 text-foreground-secondary">{formatDate(promotion.starts_at, locale)}</dd></div><div><dt className="uppercase tracking-[.14em] text-foreground-muted">{ui("ma99be3da0c9d")}</dt><dd className="mt-1 text-foreground-secondary">{formatDate(promotion.expires_at, locale)}</dd></div><div><dt className="uppercase tracking-[.14em] text-foreground-muted">{ui("me7976b8131b5")}</dt><dd className="mt-1 text-foreground-secondary">{promotion.max_uses_per_customer} {" "}{ui("mf86b564ddedc")}</dd></div></dl><div className="mt-5 flex gap-2"><button type="button" onClick={() => editPromotion(promotion)} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 border border-border text-[9px] uppercase tracking-[.14em] text-foreground hover:border-accent"><Pencil size={13} /> {" "}{ui("m5301648dcf6b")}</button><button type="button" disabled={isPending} onClick={() => { if (!window.confirm(uiText("Delete this promotion? Assigned customer links will also be removed."))) return; startTransition(async () => { const result = await deletePromotion(promotion.id); setMessage({ kind: result.success ? "success" : "error", text: result.message }); if (result.success) router.refresh(); }); }} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 border border-red-500/30 text-[9px] uppercase tracking-[.14em] text-red-300 disabled:opacity-50"><Trash2 size={13} /> {" "}{ui("mf6fdbe48dc54")}</button></div></article>)}{!promotions.length ? <div className="border border-dashed border-border px-6 py-16 text-center text-sm text-foreground-muted lg:col-span-2">{ui("m63d4baddcc92")}</div> : null}</div></section>;
}
