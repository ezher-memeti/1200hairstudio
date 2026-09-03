export type TimedEntityStatus = "active" | "scheduled" | "disabled";

type TimedEntity = {
  is_active: boolean;
  starts_at: string | null;
  expires_at: string | null;
};

export function getTimedEntityStatus(entity: TimedEntity, now = new Date()): TimedEntityStatus {
  if (!entity.is_active) return "disabled";
  if (entity.expires_at && new Date(entity.expires_at).getTime() < now.getTime()) return "disabled";
  if (entity.starts_at && new Date(entity.starts_at).getTime() > now.getTime()) return "scheduled";
  return "active";
}

export function isTimedEntityExpired(entity: Pick<TimedEntity, "expires_at">, now = new Date()) {
  return Boolean(entity.expires_at && new Date(entity.expires_at).getTime() < now.getTime());
}
