export type NotificationKind = "customer_registered" | "appointment_confirmed" | "appointment_completed";
export type AdminNotification = {
  id: string;
  kind: NotificationKind;
  entity_id: string | null;
  starts_at: string | null;
  booking_source: string | null;
  created_at: string;
  read_at: string | null;
};
export type NotificationPage = { items: AdminNotification[]; nextCursor: string | null };
