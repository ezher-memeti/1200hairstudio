export type PushPreferences = { newCustomers: boolean; newAppointments: boolean; completed: boolean; adminBookings: boolean };
export const DEFAULT_PUSH_PREFERENCES: PushPreferences = { newCustomers: true, newAppointments: true, completed: false, adminBookings: false };
export function normalizePushPreferences(value: unknown): PushPreferences {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Object.fromEntries(Object.entries(DEFAULT_PUSH_PREFERENCES).map(([key, fallback]) => [key, typeof record[key] === "boolean" ? record[key] : fallback])) as PushPreferences;
}
export const isPushId = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
