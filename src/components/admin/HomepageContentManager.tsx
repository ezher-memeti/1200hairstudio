"use client";

import { useMemo, useState, useTransition } from "react";
import { ChevronDown, RotateCcw, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { saveHomepageContentSection } from "@/app/admin/(dashboard)/site-settings/homepage-content/actions";
import { homepageContentDefaults, type HomepageContentKey, type HomepageContentSection } from "@/lib/homepage-content-defaults";
import type { AdminHomepageContentField } from "@/lib/homepage-content";

type Props = {
  configured: boolean;
  fields: AdminHomepageContentField[];
};

type Feedback = { kind: "success" | "error"; text: string };

export default function HomepageContentManager({ configured, fields }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [values, setValues] = useState<Record<HomepageContentKey, string>>(() => Object.fromEntries(fields.map((field) => [field.contentKey, field.value])) as Record<HomepageContentKey, string>);
  const [openSections, setOpenSections] = useState<Set<HomepageContentSection>>(() => new Set([fields[0]?.section].filter(Boolean) as HomepageContentSection[]));
  const [feedback, setFeedback] = useState<Partial<Record<HomepageContentSection, Feedback>>>({});
  const sections = useMemo(() => {
    const grouped = new Map<HomepageContentSection, AdminHomepageContentField[]>();
    for (const field of fields) {
      const sectionFields = grouped.get(field.section) ?? [];
      sectionFields.push(field);
      grouped.set(field.section, sectionFields);
    }
    return Array.from(grouped.entries()).map(([section, sectionFields]) => [section, sectionFields.sort((left, right) => left.sortOrder - right.sortOrder)] as const);
  }, [fields]);

  function toggleSection(section: HomepageContentSection) {
    setOpenSections((current) => {
      const next = new Set(current);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }

  function saveSection(section: HomepageContentSection, sectionFields: AdminHomepageContentField[]) {
    startTransition(async () => {
      const result = await saveHomepageContentSection(section, sectionFields.map((field) => ({ contentKey: field.contentKey, value: values[field.contentKey] })));
      setFeedback((current) => ({ ...current, [section]: { kind: result.success ? "success" : "error", text: result.message } }));
      if (result.success) router.refresh();
    });
  }

  return (
    <section className="min-w-0">
      <div>
        <p className="font-admin-primary text-[10px] uppercase tracking-[0.22em] text-foreground-muted">Site Management</p>
        <h1 className="mt-2 font-admin-display text-3xl font-semibold text-foreground sm:text-4xl">Homepage Content</h1>
        <p className="mt-3 max-w-2xl font-admin-primary text-sm leading-6 text-foreground-secondary">Edit public homepage copy without changing services, availability, gallery content, or booking data.</p>
      </div>

      {!configured ? (
        <div className="mt-7 border border-accent/30 bg-accent/5 px-5 py-4 text-sm leading-6 text-foreground-secondary">
          Homepage content storage has not been configured yet. The public website is safely using its built-in default copy.
        </div>
      ) : null}

      <div className="mt-7 space-y-4">
        {sections.map(([section, sectionFields]) => {
          const isOpen = openSections.has(section);
          const sectionFeedback = feedback[section];
          return (
            <article key={section} className="border border-border bg-surface">
              <button type="button" onClick={() => toggleSection(section)} aria-expanded={isOpen} className="flex min-h-16 w-full items-center justify-between gap-4 px-5 text-left sm:px-6">
                <div><h2 className="font-admin-display text-xl font-semibold text-foreground">{section}</h2><p className="mt-1 text-xs text-foreground-muted">{sectionFields.length} editable {sectionFields.length === 1 ? "field" : "fields"}</p></div>
                <ChevronDown size={17} className={`shrink-0 text-foreground-muted transition-transform ${isOpen ? "rotate-180 text-accent" : ""}`} />
              </button>

              {isOpen ? (
                <div className="border-t border-border px-5 py-6 sm:px-6">
                  <div className="grid gap-5 lg:grid-cols-2">
                    {sectionFields.map((field) => {
                      const value = values[field.contentKey];
                      const inputClass = "mt-2 w-full border border-border bg-background px-4 text-sm text-foreground outline-none transition-colors placeholder:text-foreground-muted focus:border-accent";
                      return (
                        <label key={field.contentKey} className={`block ${field.contentType === "textarea" ? "lg:col-span-2" : ""}`}>
                          <span className="font-admin-primary text-[10px] uppercase tracking-[0.16em] text-foreground-muted">{field.label}</span>
                          {field.contentType === "textarea" ? (
                            <textarea rows={3} required value={value} onChange={(event) => setValues((current) => ({ ...current, [field.contentKey]: event.target.value }))} className={`${inputClass} resize-y py-3 leading-6`} />
                          ) : (
                            <input required value={value} onChange={(event) => setValues((current) => ({ ...current, [field.contentKey]: event.target.value }))} className={`${inputClass} min-h-11`} />
                          )}
                          <span className="mt-2 block text-[10px] text-foreground-muted">{value.length} characters · recommended max {field.recommendedMax}</span>
                        </label>
                      );
                    })}
                  </div>

                  {sectionFeedback ? <p className={`mt-5 text-sm ${sectionFeedback.kind === "success" ? "text-emerald-300" : "text-red-300"}`}>{sectionFeedback.text}</p> : null}

                  <div className="mt-7 flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
                    <button type="button" disabled={isPending} onClick={() => setValues((current) => ({ ...current, ...Object.fromEntries(sectionFields.map((field) => [field.contentKey, homepageContentDefaults[field.contentKey]])) }))} className="inline-flex min-h-11 items-center justify-center gap-2 border border-border px-4 text-[10px] uppercase tracking-[.16em] text-foreground-secondary transition-colors hover:border-foreground-muted hover:text-foreground disabled:opacity-50"><RotateCcw size={14} /> Reset to Default</button>
                    <button type="button" disabled={isPending || !configured} onClick={() => saveSection(section, sectionFields)} className="inline-flex min-h-11 items-center justify-center gap-2 bg-accent px-5 text-[10px] font-semibold uppercase tracking-[.16em] text-background transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"><Save size={14} /> {isPending ? "Saving…" : "Save Changes"}</button>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
