import "server-only";

import { requireAdminUser } from "@/lib/auth/customer";

export const ADMIN_SETTING_KEYS = ["business", "booking", "notifications", "finance"] as const;
export type AdminSettingKey = (typeof ADMIN_SETTING_KEYS)[number];

export type BusinessSettings = {
  businessName: string;
  addressLine: string;
  postalCode: string;
  city: string;
  region: string;
  country: string;
  phone: string;
  email: string;
  website: string;
  timezone: string;
  currency: "CHF";
};

export type BookingSettings = {
  slotIntervalMinutes: number;
  minimumNoticeHours: number;
  maximumHorizonDays: number;
  allowGuestBookings: boolean;
  allowCustomerReschedule: boolean;
  allowCustomerCancel: boolean;
  cancellationCutoffHours: number;
};

export type NotificationSettings = {
  bookingConfirmationEmail: boolean;
  rescheduleEmail: boolean;
  cancellationEmail: boolean;
  receiptEmailEnabled: boolean;
  adminBookingNotification: boolean;
  senderName: string;
};

export const PAYMENT_METHODS = ["cash", "twint", "card", "bank_transfer", "other"] as const;
export type PaymentMethodSetting = (typeof PAYMENT_METHODS)[number];
export type ReportGrouping = "day" | "week" | "month";

export type FinanceSettings = {
  currency: "CHF";
  defaultReportGrouping: ReportGrouping;
  autoGenerateReceipt: boolean;
  enabledPaymentMethods: PaymentMethodSetting[];
};

export type AdminSettings = {
  business: BusinessSettings;
  booking: BookingSettings;
  notifications: NotificationSettings;
  finance: FinanceSettings;
};

export const DEFAULT_ADMIN_SETTINGS: AdminSettings = {
  business: {
    businessName: "1200 Hairstudio",
    addressLine: "Schulstrasse 2",
    postalCode: "8599",
    city: "Salmsach",
    region: "Thurgau",
    country: "Switzerland",
    phone: "",
    email: "",
    website: "",
    timezone: "Europe/Zurich",
    currency: "CHF",
  },
  booking: {
    slotIntervalMinutes: 30,
    minimumNoticeHours: 2,
    maximumHorizonDays: 90,
    allowGuestBookings: true,
    allowCustomerReschedule: true,
    allowCustomerCancel: true,
    cancellationCutoffHours: 24,
  },
  notifications: {
    bookingConfirmationEmail: true,
    rescheduleEmail: true,
    cancellationEmail: true,
    receiptEmailEnabled: true,
    adminBookingNotification: false,
    senderName: "1200 Hairstudio",
  },
  finance: {
    currency: "CHF",
    defaultReportGrouping: "month",
    autoGenerateReceipt: false,
    enabledPaymentMethods: ["cash", "twint", "card"],
  },
};

type JsonObject = Record<string, unknown>;

function objectValue(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function read(source: JsonObject, camel: string, snake: string) {
  return source[camel] ?? source[snake];
}

function text(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizeAdminSetting<K extends AdminSettingKey>(key: K, value: unknown): AdminSettings[K] {
  const source = objectValue(value);
  const defaults = DEFAULT_ADMIN_SETTINGS[key];

  if (key === "business") {
    const base = defaults as BusinessSettings;
    return {
      businessName: text(read(source, "businessName", "business_name"), base.businessName),
      addressLine: text(source.addressLine ?? source.address_line1 ?? source.address_line, base.addressLine),
      postalCode: text(read(source, "postalCode", "postal_code"), base.postalCode),
      city: text(source.city, base.city),
      region: text(source.region, base.region),
      country: text(source.country, base.country),
      phone: text(source.phone, base.phone),
      email: text(source.email, base.email),
      website: text(source.website, base.website),
      timezone: text(source.timezone, base.timezone),
      currency: "CHF",
    } as AdminSettings[K];
  }

  if (key === "booking") {
    const base = defaults as BookingSettings;
    return {
      slotIntervalMinutes: numberValue(source.slot_interval_minutes, base.slotIntervalMinutes),
      minimumNoticeHours: numberValue(source.minimum_booking_notice_hours, base.minimumNoticeHours),
      maximumHorizonDays: numberValue(source.maximum_booking_horizon_days, base.maximumHorizonDays),
      allowGuestBookings: booleanValue(source.allow_guest_bookings, base.allowGuestBookings),
      allowCustomerReschedule: booleanValue(source.allow_customer_reschedule, base.allowCustomerReschedule),
      allowCustomerCancel: booleanValue(source.allow_customer_cancel, base.allowCustomerCancel),
      cancellationCutoffHours: numberValue(source.cancellation_cutoff_hours, base.cancellationCutoffHours),
    } as AdminSettings[K];
  }

  if (key === "notifications") {
    const base = defaults as NotificationSettings;
    return {
      bookingConfirmationEmail: booleanValue(read(source, "bookingConfirmationEmail", "booking_confirmation_email"), base.bookingConfirmationEmail),
      rescheduleEmail: booleanValue(read(source, "rescheduleEmail", "reschedule_email"), base.rescheduleEmail),
      cancellationEmail: booleanValue(read(source, "cancellationEmail", "cancellation_email"), base.cancellationEmail),
      receiptEmailEnabled: booleanValue(read(source, "receiptEmailEnabled", "receipt_email_enabled"), base.receiptEmailEnabled),
      adminBookingNotification: booleanValue(read(source, "adminBookingNotification", "admin_booking_notification"), base.adminBookingNotification),
      senderName: text(read(source, "senderName", "sender_name"), base.senderName),
    } as AdminSettings[K];
  }

  const base = defaults as FinanceSettings;
  const methods = read(source, "enabledPaymentMethods", "enabled_payment_methods");
  const grouping = read(source, "defaultReportGrouping", "default_report_grouping");
  const enabledMethods = Array.isArray(methods)
    ? methods.filter((method): method is PaymentMethodSetting => PAYMENT_METHODS.includes(method as PaymentMethodSetting))
    : base.enabledPaymentMethods;
  return {
    currency: "CHF",
    defaultReportGrouping: grouping === "day" || grouping === "week" || grouping === "month" ? grouping : base.defaultReportGrouping,
    autoGenerateReceipt: booleanValue(read(source, "autoGenerateReceipt", "auto_generate_receipt"), base.autoGenerateReceipt),
    enabledPaymentMethods: enabledMethods.length ? enabledMethods : base.enabledPaymentMethods,
  } as AdminSettings[K];
}

export async function getAdminSetting<K extends AdminSettingKey>(key: K): Promise<AdminSettings[K]> {
  const { supabase } = await requireAdminUser();
  const { data, error } = await supabase
    .from("admin_settings")
    .select("settings_value")
    .eq("settings_key", key)
    .maybeSingle();

  if (error) throw new Error(`Unable to load ${key} settings.`);
  return normalizeAdminSetting(key, data?.settings_value);
}

export async function getAllAdminSettings(): Promise<AdminSettings> {
  const { supabase } = await requireAdminUser();
  const { data, error } = await supabase
    .from("admin_settings")
    .select("settings_key, settings_value")
    .in("settings_key", [...ADMIN_SETTING_KEYS]);

  if (error) throw new Error("Unable to load admin settings.");
  const rows = new Map((data ?? []).map((row) => [row.settings_key, row.settings_value]));
  return {
    business: normalizeAdminSetting("business", rows.get("business")),
    booking: normalizeAdminSetting("booking", rows.get("booking")),
    notifications: normalizeAdminSetting("notifications", rows.get("notifications")),
    finance: normalizeAdminSetting("finance", rows.get("finance")),
  };
}

function serializeSetting<K extends AdminSettingKey>(key: K, value: AdminSettings[K]) {
  if (key === "business") {
    const item = value as BusinessSettings;
    return { business_name: item.businessName, address_line1: item.addressLine, postal_code: item.postalCode, city: item.city, region: item.region, country: item.country, phone: item.phone, email: item.email, website: item.website, timezone: item.timezone, currency: item.currency };
  }
  if (key === "booking") {
    const item = value as BookingSettings;
    return { slot_interval_minutes: item.slotIntervalMinutes, minimum_booking_notice_hours: item.minimumNoticeHours, maximum_booking_horizon_days: item.maximumHorizonDays, allow_guest_bookings: item.allowGuestBookings, allow_customer_reschedule: item.allowCustomerReschedule, allow_customer_cancel: item.allowCustomerCancel, cancellation_cutoff_hours: item.cancellationCutoffHours };
  }
  if (key === "notifications") {
    const item = value as NotificationSettings;
    return { booking_confirmation_email: item.bookingConfirmationEmail, reschedule_email: item.rescheduleEmail, cancellation_email: item.cancellationEmail, receipt_email_enabled: item.receiptEmailEnabled, admin_booking_notification: item.adminBookingNotification, sender_name: item.senderName };
  }
  const item = value as FinanceSettings;
  return { currency: item.currency, default_report_grouping: item.defaultReportGrouping, auto_generate_receipt: item.autoGenerateReceipt, enabled_payment_methods: item.enabledPaymentMethods };
}

export async function updateAdminSetting<K extends AdminSettingKey>(key: K, value: AdminSettings[K]) {
  const { supabase, user } = await requireAdminUser();
  const { error } = await supabase.from("admin_settings").upsert(
    { settings_key: key, settings_value: serializeSetting(key, value), updated_by: user.id },
    { onConflict: "settings_key" },
  );
  if (error) throw new Error(`Unable to save ${key} settings.`);
}
