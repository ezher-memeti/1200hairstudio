import type { LucideIcon } from "lucide-react";
import { ArrowUpRight, AtSign, MessageSquareText, PenLine, Phone } from "lucide-react";
import type { ContactSectionSettings } from "@/lib/contact-section/types";

type Props = { settings: ContactSectionSettings; preview?: boolean };

type ContactAction = {
  href: string;
  label: string;
  ariaLabel: string;
  icon: LucideIcon;
  compactLabel: string;
  external?: boolean;
};

function ContactActionLink({ action, preview }: { action: ContactAction; preview: boolean }) {
  const Icon = action.icon;

  return (
    <a
      href={action.href}
      target={action.external ? "_blank" : undefined}
      rel={action.external ? "noopener noreferrer" : undefined}
      aria-label={preview ? `${action.ariaLabel} (preview)` : action.ariaLabel}
      onClick={preview ? (event) => event.preventDefault() : undefined}
      className="group relative flex min-h-[88px] min-w-0 flex-col items-center justify-center gap-2 px-1 py-4 text-center outline-none transition-colors duration-200 hover:bg-surface/40 focus-visible:bg-surface/40 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent sm:min-h-28 sm:gap-3 sm:px-3 sm:py-5 lg:min-h-40 lg:gap-5 lg:px-5 lg:py-7"
    >
      <Icon aria-hidden="true" strokeWidth={1.25} className="size-[clamp(1.125rem,4.8vw,2rem)] text-foreground-muted transition-[color,transform] duration-200 group-hover:-translate-y-0.5 group-hover:text-accent group-focus-visible:-translate-y-0.5 group-focus-visible:text-accent" />
      <span className="flex min-w-0 items-center gap-1 font-primary text-[clamp(0.43rem,1.9vw,0.6875rem)] font-medium uppercase tracking-[clamp(0.05em,0.5vw,0.2em)] text-foreground-secondary transition-colors duration-200 group-hover:text-foreground group-focus-visible:text-foreground sm:gap-1.5">
        <span className="whitespace-nowrap sm:hidden">{action.compactLabel}</span>
        <span className="hidden whitespace-nowrap sm:inline">{action.label}</span>
        {action.external ? <ArrowUpRight aria-hidden="true" className="size-[clamp(0.55rem,1.8vw,0.75rem)] shrink-0 text-accent opacity-60 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-focus-visible:translate-x-0.5 group-focus-visible:-translate-y-0.5" /> : null}
      </span>
    </a>
  );
}

export default function ContactSection({ settings, preview = false }: Props) {
  if (!settings.isEnabled && !preview) return null;

  const phoneHref = settings.phoneNumber.trim() ? `tel:${settings.phoneNumber.replace(/[^+\d]/g, "")}` : "";
  const actions: ContactAction[] = [
    phoneHref && settings.callCtaLabel.trim() ? { href: phoneHref, label: settings.callCtaLabel, compactLabel: "Call", ariaLabel: "Call 1200 Hairstudio", icon: Phone } : null,
    settings.instagramEnabled && settings.instagramUrl.trim() && settings.instagramCtaLabel.trim() ? { href: settings.instagramUrl, label: settings.instagramCtaLabel, compactLabel: "Insta", ariaLabel: "Open 1200 Hairstudio on Instagram", icon: AtSign, external: true } : null,
    settings.googleReviewsEnabled && settings.googleReviewsUrl.trim() && settings.reviewsCtaLabel.trim() ? { href: settings.googleReviewsUrl, label: settings.reviewsCtaLabel, compactLabel: "Reviews", ariaLabel: "Read 1200 Hairstudio Google reviews", icon: MessageSquareText, external: true } : null,
    settings.googleReviewsEnabled && settings.googleLeaveReviewUrl.trim() && settings.leaveReviewCtaLabel.trim() ? { href: settings.googleLeaveReviewUrl, label: settings.leaveReviewCtaLabel, compactLabel: "Review", ariaLabel: "Leave a Google review for 1200 Hairstudio", icon: PenLine, external: true } : null,
  ].filter((action): action is ContactAction => action !== null);

  if (actions.length === 0 && !preview) return null;
  const columns = actions.length === 1 ? "grid-cols-1" : actions.length === 2 ? "grid-cols-2" : actions.length === 3 ? "grid-cols-3" : "grid-cols-4";

  return (
    <section id={preview ? undefined : "contact"} className={`overflow-hidden bg-background ${preview ? "" : "border-t border-border"}`}>
      <div className={preview ? "p-4 sm:p-6" : "page-container py-12 sm:py-16 lg:py-20"}>
        {!settings.isEnabled && preview ? <p className="mb-5 border border-border px-3 py-2 font-primary text-[10px] uppercase tracking-[0.18em] text-foreground-muted">Section disabled · preview only</p> : null}
        <header className="min-w-0 border-b border-border pb-7 sm:pb-8">
          {settings.eyebrow.trim() ? <p className="font-primary text-[10px] uppercase tracking-[0.34em] text-accent sm:text-xs">{settings.eyebrow}</p> : null}
          {settings.title.trim() ? <h2 className={`mt-3 whitespace-pre-line font-display font-semibold uppercase leading-[0.92] tracking-[-0.035em] text-foreground ${preview ? "text-[clamp(2rem,8vw,2.5rem)]" : "text-[clamp(2.35rem,8vw,4.75rem)]"}`}>{settings.title}</h2> : null}
        </header>

        {actions.length > 0 ? (
          <div className={`grid min-w-0 border-b border-border ${columns}`}>
            {actions.map((action) => <div key={`${action.href}-${action.label}`} className="min-w-0 border-r border-border last:border-r-0"><ContactActionLink action={action} preview={preview} /></div>)}
          </div>
        ) : <p className="border-b border-border py-8 text-sm text-foreground-muted">No contact actions are currently configured.</p>}
      </div>
    </section>
  );
}
