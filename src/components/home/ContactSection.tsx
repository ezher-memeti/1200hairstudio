import type { ReactNode } from "react";
import { ArrowUpRight, AtSign, MessageSquareText, Phone } from "lucide-react";
import type { ContactSectionSettings } from "@/lib/contact-section/types";

type Props = { settings: ContactSectionSettings; preview?: boolean };

function ActionLink({ href, label, external = false }: { href: string; label: string; external?: boolean }) {
  if (!href.trim() || !label.trim()) return null;
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className="group/action inline-flex min-h-11 w-fit items-center gap-2 py-2 font-primary text-[11px] uppercase tracking-[0.18em] text-foreground outline-none transition-colors hover:text-accent focus-visible:ring-1 focus-visible:ring-accent"
    >
      <span className="relative after:absolute after:-bottom-1 after:left-0 after:h-px after:w-full after:origin-left after:scale-x-50 after:bg-accent after:transition-transform group-hover/action:after:scale-x-100 group-focus-visible/action:after:scale-x-100 motion-reduce:after:transition-none">
        {label}
      </span>
      {external ? <ArrowUpRight size={13} aria-hidden="true" /> : null}
    </a>
  );
}

function ContactItem({ icon, label, value, actions, wide = false }: { icon: ReactNode; label: string; value: string; actions: ReactNode; wide?: boolean }) {
  if (!value.trim() && !actions) return null;
  return (
    <article className={`group min-w-0 border-t border-border py-6 sm:py-7 ${wide ? "sm:col-span-2" : ""}`}>
      <div className="flex min-w-0 items-start gap-4 sm:gap-5">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center border border-border text-foreground-muted transition-colors group-hover:border-accent/50 group-hover:text-accent motion-reduce:transition-none" aria-hidden="true">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-primary text-[10px] uppercase tracking-[0.26em] text-accent">{label}</p>
          {value.trim() ? <p className="mt-3 whitespace-pre-line break-words font-primary text-base leading-7 text-foreground-secondary sm:text-lg">{value}</p> : null}
          {actions ? <div className="mt-3 flex flex-wrap gap-x-7 gap-y-1">{actions}</div> : null}
        </div>
      </div>
    </article>
  );
}

export default function ContactSection({ settings, preview = false }: Props) {
  if (!settings.isEnabled && !preview) return null;

  const phoneHref = settings.phoneNumber.trim() ? `tel:${settings.phoneNumber.replace(/[^+\d]/g, "")}` : "";
  const username = settings.instagramUsername.trim();
  const instagramDisplay = username ? (username.startsWith("@") ? username : `@${username}`) : "";

  return (
    <section id={preview ? undefined : "contact"} className={`overflow-hidden bg-background ${preview ? "" : "border-t border-border"}`}>
      <div className={preview ? "p-5 sm:p-7" : "page-container py-14 sm:py-20 lg:py-24"}>
        {!settings.isEnabled && preview ? <p className="mb-5 border border-border px-3 py-2 font-primary text-[10px] uppercase tracking-[0.18em] text-foreground-muted">Section disabled · preview only</p> : null}

        <div className={`grid min-w-0 gap-10 md:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)] md:items-start md:gap-10 ${preview ? "xl:gap-12" : "lg:gap-16 xl:gap-24"}`}>
          <header className="min-w-0 md:sticky md:top-32">
            {settings.eyebrow.trim() ? <p className="font-primary text-[10px] uppercase tracking-[0.34em] text-accent sm:text-xs">{settings.eyebrow}</p> : null}
            {settings.title.trim() ? <h2 className={`mt-4 max-w-[9ch] whitespace-pre-line break-words font-display font-semibold uppercase leading-[0.88] tracking-[-0.045em] text-foreground ${preview ? "text-[clamp(2rem,5vw,3.5rem)]" : "text-[clamp(3rem,7vw,6.25rem)]"}`}>{settings.title}</h2> : null}
            {settings.description.trim() ? <p className="mt-6 max-w-md font-primary text-sm leading-7 text-foreground-secondary sm:text-base">{settings.description}</p> : null}
          </header>

          <div className="grid min-w-0 sm:grid-cols-2 sm:gap-x-8 lg:gap-x-12">
            <ContactItem icon={<Phone size={17} />} label="Phone" value={settings.phoneDisplay || settings.phoneNumber} actions={phoneHref ? <ActionLink href={phoneHref} label={settings.callCtaLabel} /> : null} />
            {settings.instagramEnabled ? <ContactItem icon={<AtSign size={17} />} label="Instagram" value={instagramDisplay} actions={<ActionLink href={settings.instagramUrl} label={settings.instagramCtaLabel} external />} /> : null}
            {settings.googleReviewsEnabled ? <ContactItem wide icon={<MessageSquareText size={17} />} label="Google Reviews" value="See what our clients say." actions={<><ActionLink href={settings.googleReviewsUrl} label={settings.reviewsCtaLabel} external /><ActionLink href={settings.googleLeaveReviewUrl} label={settings.leaveReviewCtaLabel} external /></>} /> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
