"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Send } from "lucide-react";
import { previewMarketingAudience, saveMarketingDraft, sendMarketingCampaign, sendMarketingTest } from "@/app/admin/(dashboard)/marketing/actions";
import AdminSelect from "@/components/admin/AdminSelect";
import { formatCustomerStatus, type CustomerStatus } from "@/lib/customers/status";
import { DEFAULT_MARKETING_FILTERS, type MarketingAudienceFilters, type MarketingEmailContent, type MarketingRecipientPreview } from "@/lib/marketing/types";

type Props = {
  content: MarketingEmailContent;
  filters: MarketingAudienceFilters;
  activeServices: string[];
  campaignId?: string;
  preview: React.ReactNode;
  onFiltersChange: (filters: MarketingAudienceFilters) => void;
  onBack: () => void;
  onComplete: (message: string) => void;
  onMessage: (kind: "success" | "error", message: string) => void;
};

const statuses: CustomerStatus[] = ["prospect", "new", "returning", "regular", "at_risk", "inactive"];

export default function MarketingAudienceReview({ content, filters, activeServices, campaignId, preview, onFiltersChange, onBack, onComplete, onMessage }: Props) {
  const [eligible, setEligible] = useState<MarketingRecipientPreview[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  useEffect(() => {
    let active = true;
    startTransition(async () => {
      const recipients = await previewMarketingAudience(filters);
      if (!active) return;
      const eligibleIds = new Set(recipients.map((recipient) => recipient.id));
      setEligible(recipients);
      setSelectedIds((current) => current.filter((id) => eligibleIds.has(id)));
    });
    return () => { active = false; };
  }, [filters]);

  function setFilters(next: MarketingAudienceFilters) { onFiltersChange(next); }
  function toggleStatus(status: CustomerStatus) {
    setFilters({ ...filters, statuses: filters.statuses.includes(status) ? filters.statuses.filter((item) => item !== status) : [...filters.statuses, status] });
  }
  function toggleRecipient(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  const activeFilterLabels = [
    ...filters.statuses.map(formatCustomerStatus),
    filters.favoriteService ? `Service: ${filters.favoriteService}` : null,
    filters.appointment === "upcoming" ? "Has upcoming" : filters.appointment === "none" ? "No upcoming" : null,
    filters.lastVisit === "30" ? "Last visit: 30 days" : filters.lastVisit === "60" ? "Last visit: 60 days" : filters.lastVisit === "90" ? "Last visit: 90 days" : filters.lastVisit === "120_plus" ? "Last visit: 120+ days" : null,
  ].filter(Boolean) as string[];

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,.95fr)_minmax(360px,1.05fr)]">
      <div className="space-y-5">
        <div className="border border-border bg-surface p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="font-admin-display text-xl font-semibold text-foreground">Audience Filters</h2><p className="mt-2 text-sm leading-6 text-foreground-secondary">Status selections use OR. Different filter groups combine with AND.</p></div>
            {activeFilterLabels.length ? <button type="button" onClick={() => setFilters(DEFAULT_MARKETING_FILTERS)} className="min-h-10 border border-border px-3 text-[9px] uppercase tracking-[.14em] text-foreground-secondary">Clear filters</button> : null}
          </div>
          <div className="mt-6"><p className="text-[10px] uppercase tracking-[.18em] text-foreground-muted">Customer Status</p><div className="mt-3 flex flex-wrap gap-2">{statuses.map((status) => <button type="button" key={status} onClick={() => toggleStatus(status)} aria-pressed={filters.statuses.includes(status)} className={`min-h-10 border px-3 text-[10px] uppercase tracking-[.12em] transition-colors ${filters.statuses.includes(status) ? "border-accent bg-accent text-background" : "border-border text-foreground-secondary hover:border-accent/60"}`}>{formatCustomerStatus(status)}</button>)}</div></div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <AdminSelect label="Favorite Service" value={filters.favoriteService ?? ""} onChange={(value) => setFilters({ ...filters, favoriteService: value || null })} options={[{ value: "", label: "All services" }, ...activeServices.map((service) => ({ value: service, label: service }))]} searchable={activeServices.length > 8} />
            <AdminSelect label="Appointments" value={filters.appointment} onChange={(value) => setFilters({ ...filters, appointment: value as MarketingAudienceFilters["appointment"] })} options={[{ value: "all", label: "Any appointment state" }, { value: "upcoming", label: "Has upcoming appointment" }, { value: "none", label: "No upcoming appointment" }]} />
            <AdminSelect label="Last Visit" value={filters.lastVisit} onChange={(value) => setFilters({ ...filters, lastVisit: value as MarketingAudienceFilters["lastVisit"] })} options={[{ value: "all", label: "Any time" }, { value: "30", label: "Within 30 days" }, { value: "60", label: "Within 60 days" }, { value: "90", label: "Within 90 days" }, { value: "120_plus", label: "120+ days ago" }]} />
          </div>
          {activeFilterLabels.length ? <div className="mt-5 flex flex-wrap gap-2">{activeFilterLabels.map((label) => <span key={label} className="border border-accent/30 bg-accent/10 px-2 py-1 text-[9px] uppercase tracking-[.12em] text-accent">{label}</span>)}</div> : null}
        </div>

        <div className="border border-border bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4"><div><h3 className="text-sm text-foreground">Eligible Recipients</h3><p className="mt-1 text-xs text-foreground-muted">{selectedIds.length} of {eligible.length} selected</p></div><div className="flex gap-2"><button type="button" disabled={!eligible.length} onClick={() => setSelectedIds(eligible.map((recipient) => recipient.id))} className="min-h-10 border border-border px-3 text-[9px] uppercase tracking-[.12em] text-foreground disabled:opacity-40">Select All Eligible</button><button type="button" disabled={!selectedIds.length} onClick={() => setSelectedIds([])} className="min-h-10 border border-border px-3 text-[9px] uppercase tracking-[.12em] text-foreground disabled:opacity-40">Clear Selection</button></div></div>
          <div className="max-h-96 overflow-y-auto">{eligible.map((recipient) => <label key={recipient.id} className={`flex min-h-16 cursor-pointer items-center gap-3 border-b border-border/70 px-5 py-3 transition-colors last:border-0 ${selectedSet.has(recipient.id) ? "bg-accent/[0.08]" : "hover:bg-background/50"}`}><input type="checkbox" checked={selectedSet.has(recipient.id)} onChange={() => toggleRecipient(recipient.id)} className="size-5 accent-[#d8b174]" /><span className="min-w-0 flex-1"><span className="block truncate text-sm text-foreground">{recipient.name}</span><span className="mt-1 block truncate text-xs text-foreground-muted">{recipient.email}</span></span><span className="shrink-0 border border-border px-2 py-1 text-[9px] uppercase tracking-[.12em] text-foreground-secondary">{formatCustomerStatus(recipient.status)}</span></label>)}{!eligible.length ? <p className="px-5 py-10 text-center text-sm text-foreground-muted">{isPending ? "Calculating eligible recipients…" : "No subscribed customers match these filters."}</p> : null}</div>
        </div>
      </div>

      <div>{preview}<div className="mt-5 border border-border bg-surface p-5"><div className="grid grid-cols-2 gap-3"><div className="border border-border bg-background p-4"><p className="text-[9px] uppercase tracking-[.16em] text-foreground-muted">Eligible</p><p className="mt-2 text-2xl text-foreground">{eligible.length}</p></div><div className="border border-accent/30 bg-accent/[0.06] p-4"><p className="text-[9px] uppercase tracking-[.16em] text-accent">Selected recipients</p><p className="mt-2 text-2xl text-foreground">{selectedIds.length}</p></div></div><p className="mt-5 text-lg text-foreground">{content.campaignName}</p><p className="mt-1 text-sm text-foreground-secondary">Subject: {content.subject}</p><div className="mt-5 flex flex-wrap gap-3"><button type="button" onClick={onBack} className="min-h-11 border border-border px-5 text-[10px] uppercase tracking-[.16em] text-foreground">Back</button><button type="button" disabled={isPending} onClick={() => startTransition(async () => { const result = await saveMarketingDraft(content, filters, campaignId); onMessage(result.success ? "success" : "error", result.message); })} className="min-h-11 border border-border px-5 text-[10px] uppercase tracking-[.16em] text-foreground disabled:opacity-50">Save Draft</button><button type="button" disabled={isPending} onClick={() => startTransition(async () => { const result = await sendMarketingTest(content); onMessage(result.success ? "success" : "error", result.message); })} className="min-h-11 border border-border px-5 text-[10px] uppercase tracking-[.16em] text-foreground disabled:opacity-50">Send Test</button><button type="button" disabled={isPending || !selectedIds.length} onClick={() => { const label = `${selectedIds.length} customer${selectedIds.length === 1 ? "" : "s"}`; if (!window.confirm(`Send this campaign to ${label}?`)) return; startTransition(async () => { const result = await sendMarketingCampaign(content, filters, selectedIds, campaignId); if (result.success) onComplete(result.message); else onMessage("error", result.message); }); }} className="ml-auto inline-flex min-h-11 items-center gap-2 bg-accent px-6 text-[10px] font-semibold uppercase tracking-[.16em] text-background disabled:opacity-40"><Send size={14} /> Send to {selectedIds.length} customer{selectedIds.length === 1 ? "" : "s"}</button></div></div></div>
    </div>
  );
}
