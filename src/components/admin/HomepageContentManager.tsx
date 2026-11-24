"use client";
import { ContentLanguageSwitcher, useAdminContentLocale } from "./content/AdminContentLocale";
import { useUiText } from "@/i18n/use-ui-text";

import { useTranslations } from "next-intl";


import { useMemo, useState, useTransition } from "react";
import { ChevronDown, RotateCcw, Save } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { saveHomepageContentSection } from "@/app/admin/(dashboard)/site-settings/homepage-content/actions";
import { homepageContentDefaults, type HomepageContentKey, type HomepageContentSection } from "@/lib/homepage-content-defaults";
import type { AdminHomepageContentField } from "@/lib/homepage-content";

type Props = {
  configured: boolean;
  fields: AdminHomepageContentField[];
};

type Feedback = { kind: "success" | "error"; text: string };

export default function HomepageContentManager({ configured, fields }: Props) {
  const uiText = useUiText();
  const { locale: contentLocale } = useAdminContentLocale();
  const copy = useTranslations("contentEditor");

  const ui = useTranslations("ui");

  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [values, setValues] = useState<Record<HomepageContentKey, string>>(() => Object.fromEntries(fields.map((field) => [field.contentKey, field.value])) as Record<HomepageContentKey, string>);
  const [germanValues, setGermanValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map(field => [field.contentKey, field.valueDe])));
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
      const result = await saveHomepageContentSection(section, sectionFields.map((field) => ({ contentKey: field.contentKey, value: field.localized && contentLocale === "de" ? germanValues[field.contentKey] : values[field.contentKey] })), contentLocale);
      setFeedback((current) => ({ ...current, [section]: { kind: result.success ? "success" : "error", text: result.success ? copy("saved", { language: contentLocale.toUpperCase() }) : `${copy("failed", { language: contentLocale.toUpperCase() })} ${result.unsavedKeys?.length ? copy("unsaved", { fields: result.unsavedKeys.map(key => uiText(sectionFields.find(field => field.contentKey === key)?.label ?? key)).join(", ") }) : uiText(result.message)}` } }));
      if (result.success) router.refresh();
    });
  }

  return (
    <section className="min-w-0">
      <div>
        <p className="font-admin-primary text-[10px] uppercase tracking-[0.22em] text-foreground-muted">{ui("ma77370cde551")}</p>
        <h1 className="mt-2 font-admin-display text-3xl font-semibold text-foreground sm:text-4xl">{ui("m580035292ee7")}</h1>
        <p className="mt-3 max-w-2xl font-admin-primary text-sm leading-6 text-foreground-secondary">{ui("m0603348dc150")}</p>
      </div>

      <ContentLanguageSwitcher />
      {!configured ? (
        <div className="mt-7 border border-accent/30 bg-accent/5 px-5 py-4 text-sm leading-6 text-foreground-secondary">
          {ui("m4bdc0b934c5a")}</div>
      ) : null}

      <div className="mt-7 space-y-4">
        {sections.map(([section, sectionFields]) => {
          const isOpen = openSections.has(section);
          const sectionFeedback = feedback[section];
          return (
            <article key={section} className="border border-border bg-surface">
              <button type="button" onClick={() => toggleSection(section)} aria-expanded={isOpen} className="flex min-h-16 w-full items-center justify-between gap-4 px-5 text-left sm:px-6">
                <div><h2 className="font-admin-display text-xl font-semibold text-foreground">{uiText(section)}</h2><p className="mt-1 text-xs text-foreground-muted">{copy("fieldCount", { count: sectionFields.length })}</p></div>
                <ChevronDown size={17} className={`shrink-0 text-foreground-muted transition-transform ${isOpen ? "rotate-180 text-accent" : ""}`} />
              </button>

              {isOpen ? (
                <div className="border-t border-border px-5 py-6 sm:px-6">
                  <div className="grid gap-5 lg:grid-cols-2">
                    {sectionFields.map((field) => {
                      const value = field.localized && contentLocale === "de" ? germanValues[field.contentKey] : values[field.contentKey];
                      const setField = (value: string) => (field.localized && contentLocale === "de" ? setGermanValues : setValues)(current => ({ ...current, [field.contentKey]: value }));
                      const inputClass = "mt-2 w-full border border-border bg-background px-4 text-sm text-foreground outline-none transition-colors placeholder:text-foreground-muted focus:border-accent";
                      return (
                        <label key={field.contentKey} className={`block ${field.contentType === "textarea" ? "lg:col-span-2" : ""}`}>
                          <span className="font-admin-primary text-[10px] uppercase tracking-[0.16em] text-foreground-muted">{uiText(field.label)}</span>
                          {field.contentType === "textarea" ? (
                            <textarea rows={3} required={contentLocale === "en" || !field.localized} value={value} onChange={(event) => setField(event.target.value)} className={`${inputClass} resize-y py-3 leading-6`} />
                          ) : (
                            <input required={contentLocale === "en" || !field.localized} value={value} onChange={(event) => setField(event.target.value)} className={`${inputClass} min-h-11`} />
                          )}
                          <span className="mt-2 block text-[10px] text-foreground-muted">{value.length} {" "}{ui("m8863c5dd8566")}{" "}{field.recommendedMax}</span>
                        </label>
                      );
                    })}
                  </div>

                  {sectionFeedback ? <p className={`mt-5 text-sm ${sectionFeedback.kind === "success" ? "text-emerald-300" : "text-red-300"}`}>{uiText(sectionFeedback.text)}</p> : null}

                  <div className="mt-7 flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
                    <button type="button" title={copy("reset")} disabled={isPending} onClick={() => { if (contentLocale === "de") setGermanValues(current => ({ ...current, ...Object.fromEntries(sectionFields.filter(field => field.localized).map(field => [field.contentKey, field.valueDe])) })); else setValues(current => ({ ...current, ...Object.fromEntries(sectionFields.filter(field => field.localized).map(field => [field.contentKey, homepageContentDefaults[field.contentKey]])) })); }} className="inline-flex min-h-11 items-center justify-center gap-2 border border-border px-4 text-[10px] uppercase tracking-[.16em] text-foreground-secondary transition-colors hover:border-foreground-muted hover:text-foreground disabled:opacity-50"><RotateCcw size={14} /> {" "}{contentLocale === "de" ? uiText("Discard changes") : ui("meef3a3483964")}</button>
                    <button type="button" disabled={isPending || !configured} onClick={() => saveSection(section, sectionFields)} className="inline-flex min-h-11 items-center justify-center gap-2 bg-accent px-5 text-[10px] font-semibold uppercase tracking-[.16em] text-background transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"><Save size={14} /> {uiText(isPending ? "Saving…" : "Save Changes")}</button>
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
