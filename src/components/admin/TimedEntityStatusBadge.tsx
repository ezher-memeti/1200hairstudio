import { intlLocale } from "@/i18n/config";
import { textFor } from "@/i18n/text";
import { useLocale } from "next-intl";

import { useTranslations } from "next-intl";
import { getTimedEntityStatus, isTimedEntityExpired } from "@/lib/timed-entity-status";

type Props = {
  entity: {
    is_active: boolean;
    starts_at: string | null;
    expires_at: string | null;
  };
};

function formatExpiry(value: string, locale: string) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: "Europe/Zurich",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

export default function TimedEntityStatusBadge({ entity }: Props) {
  const uiLocale = useLocale();
  const uiText = <T,>(value: T): T => typeof value === "string" ? textFor(uiLocale, value) as T : value;

  const ui = useTranslations("ui");

  const status = getTimedEntityStatus(entity);
  const expired = isTimedEntityExpired(entity);
  const classes = status === "active"
    ? "border-emerald-500/30 text-emerald-300"
    : status === "scheduled"
      ? "border-accent/35 text-accent"
      : "border-border text-foreground-muted";

  return <div className="shrink-0 text-right"><span className={`inline-flex border px-2 py-1 text-[9px] uppercase tracking-[.14em] ${classes}`}>{uiText(status)}</span>{expired && entity.expires_at ? <p className="mt-1 max-w-40 text-[9px] leading-4 text-foreground-muted">{ui("ma689a999a5e6")}{" "}{formatExpiry(entity.expires_at, uiLocale)}</p> : null}</div>;
}
