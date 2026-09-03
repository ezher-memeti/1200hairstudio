import { getTimedEntityStatus, isTimedEntityExpired } from "@/lib/timed-entity-status";

type Props = {
  entity: {
    is_active: boolean;
    starts_at: string | null;
    expires_at: string | null;
  };
};

function formatExpiry(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
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
  const status = getTimedEntityStatus(entity);
  const expired = isTimedEntityExpired(entity);
  const classes = status === "active"
    ? "border-emerald-500/30 text-emerald-300"
    : status === "scheduled"
      ? "border-accent/35 text-accent"
      : "border-border text-foreground-muted";

  return <div className="shrink-0 text-right"><span className={`inline-flex border px-2 py-1 text-[9px] uppercase tracking-[.14em] ${classes}`}>{status}</span>{expired && entity.expires_at ? <p className="mt-1 max-w-40 text-[9px] leading-4 text-foreground-muted">Expired {formatExpiry(entity.expires_at)}</p> : null}</div>;
}
