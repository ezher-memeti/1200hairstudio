import "server-only";

import { getRuntimeSettings } from "@/lib/admin/runtime-settings";
import { getSiteUrl } from "@/lib/auth/url";
import { sendCustomerEmail, type CustomerEmailType } from "@/lib/email/gmail";
import type { RecurringFrequency } from "@/lib/recurring-bookings/types";

type RecurringEmailOccurrence = { startAt: string };

export type RecurringEmailDetails = {
  to: string;
  customerId?: string | null;
  recurringBookingId?: string | null;
  customerName?: string | null;
  serviceName: string;
  frequency: RecurringFrequency;
  weekday: number;
  startTime: string;
  startsOn: string;
  endsOn: string;
  reservedCount?: number;
  conflictCount?: number;
  upcomingAppointments?: RecurringEmailOccurrence[];
  removedCount?: number;
  effectiveFrom?: string;
  previousPattern?: string;
};

type RecurringEmailVariant = "confirmed" | "updated" | "removed" | "paused" | "resumed";

const EMAIL_TYPES: Record<RecurringEmailVariant, CustomerEmailType> = {
  confirmed: "regular_booking_confirmation",
  updated: "regular_booking_updated",
  removed: "regular_booking_removed",
  paused: "regular_booking_paused",
  resumed: "regular_booking_resumed",
};

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

function formatDateKey(value: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Zurich", day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00Z`));
}

function formatOccurrence(value: string) {
  const date = new Date(value);
  return {
    date: new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Zurich", day: "2-digit", month: "short", year: "numeric" }).format(date),
    time: new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit", hour12: false }).format(date),
  };
}

function frequencyLabel(value: RecurringFrequency) {
  return value === "weekly" ? "Every week" : "Every 2 weeks";
}

function variantContent(variant: RecurringEmailVariant, details: RecurringEmailDetails) {
  const accountUrl = `${getSiteUrl()}/account`;
  if (variant === "updated") return { subject: "Your regular booking was updated — 1200 Hairstudio", eyebrow: "Regular Booking Updated", headline: "Your new schedule.", body: "Your regular booking schedule has been updated. The latest reservations are shown below.", cta: "View Updated Booking →", href: accountUrl };
  if (variant === "removed") return { subject: "Regular booking removed — 1200 Hairstudio", eyebrow: "Regular Booking", headline: "Your regular booking has been removed.", body: "Your future reservations belonging to this regular booking have been removed from the schedule. Past and completed appointments remain available in your account history.", cta: "Book A Session →", href: `${getSiteUrl()}/#booking` };
  if (variant === "paused") return { subject: "Regular booking paused — 1200 Hairstudio", eyebrow: "Regular Booking Paused", headline: "Your regular schedule is paused.", body: "Future reservations in this series have been cancelled while the regular booking is paused. Resuming it will reserve currently available future dates again.", cta: "Manage Regular Booking →", href: accountUrl };
  if (variant === "resumed") return { subject: "Regular booking resumed — 1200 Hairstudio", eyebrow: "Regular Booking Resumed", headline: "Your regular time is reserved again.", body: "Your regular booking is active again. Available future appointments have been reserved according to the schedule below.", cta: "View Regular Booking →", href: accountUrl };
  return { subject: "Regular booking confirmed — 1200 Hairstudio", eyebrow: "Regular Booking", headline: "Your regular time is reserved.", body: "Your regular booking has been confirmed. Your upcoming appointments have been reserved according to the schedule below.", cta: "View Regular Booking →", href: accountUrl };
}

async function buildRecurringEmail(variant: RecurringEmailVariant, details: RecurringEmailDetails) {
  const settings = await getRuntimeSettings();
  const content = variantContent(variant, details);
  const customerName = details.customerName?.trim() || "Customer";
  const weekday = WEEKDAYS[details.weekday - 1] ?? "Scheduled day";
  const showUpcomingAppointments = variant !== "paused" && variant !== "removed";
  const appointments = showUpcomingAppointments
    ? (details.upcomingAppointments ?? []).slice(0, 5).map((item) => formatOccurrence(item.startAt))
    : [];
  const hiddenCount = Math.max(0, (details.reservedCount ?? appointments.length) - appointments.length);
  const address = [settings.business.businessName, settings.business.addressLine, [settings.business.postalCode, settings.business.city, settings.business.region].filter(Boolean).join(" ")].filter(Boolean);
  const summaryLines = [
    details.serviceName,
    `${frequencyLabel(details.frequency)} · ${weekday} · ${details.startTime}`,
    `${formatDateKey(details.startsOn)} — ${formatDateKey(details.endsOn)}`,
  ];
  const eventLine = variant === "removed"
    ? `${details.removedCount ?? 0} future appointment${details.removedCount === 1 ? "" : "s"} removed`
    : `${details.reservedCount ?? 0} appointment${details.reservedCount === 1 ? "" : "s"} reserved`;
  const text = [
    settings.business.businessName,
    content.eyebrow,
    "",
    content.headline,
    `Hi ${customerName},`,
    content.body,
    "",
    ...summaryLines,
    variant === "updated" && details.effectiveFrom ? `Effective from: ${formatDateKey(details.effectiveFrom)}` : "",
    variant === "updated" && details.previousPattern ? `Previous: ${details.previousPattern}` : "",
    eventLine,
    details.conflictCount ? `${details.conflictCount} date${details.conflictCount === 1 ? "" : "s"} need attention` : "",
    "",
    ...appointments.flatMap((appointment) => [`${appointment.date} · ${appointment.time}`]),
    hiddenCount ? `+ ${hiddenCount} more appointments` : "",
    "",
    `${content.cta}: ${content.href}`,
    "",
    ...(variant === "confirmed" ? ["Good to know", "Each appointment can still be managed individually from your account. Changes to one appointment do not automatically change your regular schedule.", ""] : []),
    ...address,
  ].filter(Boolean).join("\n");
  const appointmentRows = appointments.map((appointment) => `<tr><td style="padding:12px 0;border-top:1px solid #292721;color:#f4f0e8;font-size:13px;letter-spacing:.08em;text-transform:uppercase">${escapeHtml(appointment.date)}</td><td align="right" style="padding:12px 0;border-top:1px solid #292721;color:#c9a56a;font-size:14px">${escapeHtml(appointment.time)}</td></tr>`).join("");
  const effectiveFromHtml = variant === "updated" && details.effectiveFrom
    ? `<div style="margin-top:18px;color:#817d75;font-size:10px;letter-spacing:.22em;text-transform:uppercase">Effective From</div><div style="margin-top:7px;color:#d8d4cc;font-size:14px">${escapeHtml(formatDateKey(details.effectiveFrom))}</div>`
    : "";
  const html = `<!doctype html><html><body style="margin:0;background:#070707;color:#f4f0e8"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#070707;padding:24px 0"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px"><tr><td style="padding:0 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #292721;background:#10100f"><tr><td style="padding:38px 34px;font-family:Arial,sans-serif"><div style="font-size:42px;font-weight:700;letter-spacing:-.06em">1200</div><div style="margin-top:8px;color:#918b80;font-size:10px;letter-spacing:.42em">HAIRSTUDIO</div><div style="margin-top:34px;color:#c9a56a;font-size:10px;letter-spacing:.28em;text-transform:uppercase">${escapeHtml(content.eyebrow)}</div><h1 style="margin:14px 0 0;font-family:Georgia,serif;font-size:34px;line-height:1.08;font-weight:400;text-transform:uppercase">${escapeHtml(content.headline)}</h1><p style="margin:18px 0 0;color:#d8d4cc;font-size:13px">Hi ${escapeHtml(customerName)},</p><p style="margin:10px 0 0;max-width:490px;color:#aaa69e;font-size:15px;line-height:1.75">${escapeHtml(content.body)}</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:30px;border:1px solid #292721;background:#151513"><tr><td style="padding:24px"><div style="color:#f4f0e8;font-family:Georgia,serif;font-size:26px;text-transform:uppercase">${escapeHtml(details.serviceName)}</div><div style="margin-top:16px;color:#c9a56a;font-size:11px;letter-spacing:.2em;text-transform:uppercase">${escapeHtml(frequencyLabel(details.frequency))}</div><div style="margin-top:7px;color:#f4f0e8;font-size:15px">${escapeHtml(weekday)} · ${escapeHtml(details.startTime)}</div><div style="margin-top:22px;color:#817d75;font-size:10px;letter-spacing:.22em;text-transform:uppercase">Series</div><div style="margin-top:7px;color:#d8d4cc;font-size:14px">${escapeHtml(formatDateKey(details.startsOn))} — ${escapeHtml(formatDateKey(details.endsOn))}</div>${effectiveFromHtml}${variant === "updated" && details.previousPattern ? `<div style="margin-top:20px;border-top:1px solid #292721;padding-top:16px;color:#817d75;font-size:12px">Previous · ${escapeHtml(details.previousPattern)}<br><span style="color:#d8d4cc">New · ${escapeHtml(weekday)} · ${escapeHtml(details.startTime)}</span></div>` : ""}<div style="margin-top:24px;border-top:1px solid #292721;padding-top:18px;color:#f4f0e8;font-size:13px;letter-spacing:.16em;text-transform:uppercase">${escapeHtml(eventLine)}</div>${details.conflictCount ? `<div style="margin-top:9px;color:#c9a56a;font-size:12px;letter-spacing:.12em;text-transform:uppercase">${details.conflictCount} date${details.conflictCount === 1 ? "" : "s"} need attention</div>` : ""}</td></tr></table>${appointments.length ? `<div style="margin-top:30px;color:#918b80;font-size:10px;letter-spacing:.24em;text-transform:uppercase">${variant === "resumed" ? "Next Appointments" : "Upcoming Appointments"}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:12px">${appointmentRows}</table>${hiddenCount ? `<div style="margin-top:12px;color:#918b80;font-size:11px;letter-spacing:.15em;text-transform:uppercase">+ ${hiddenCount} more appointments</div>` : ""}` : ""}<table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:30px"><tr><td style="border:1px solid #c9a56a"><a href="${escapeHtml(content.href)}" style="display:inline-block;padding:15px 20px;color:#c9a56a;font-size:10px;font-weight:600;letter-spacing:.2em;text-decoration:none;text-transform:uppercase">${escapeHtml(content.cta)}</a></td></tr></table>${variant === "removed" ? `<div style="margin-top:18px"><a href="${escapeHtml(`${getSiteUrl()}/account`)}" style="color:#918b80;font-size:11px;letter-spacing:.12em;text-transform:uppercase">Reapply Regular Booking →</a></div>` : ""}${variant === "confirmed" ? `<div style="margin-top:32px;border-top:1px solid #292721;padding-top:24px"><div style="color:#c9a56a;font-size:10px;letter-spacing:.22em;text-transform:uppercase">Good To Know</div><p style="margin:10px 0 0;color:#918b80;font-size:13px;line-height:1.7">Each appointment can still be managed individually from your account. Changes to one appointment do not automatically change your regular schedule.</p></div>` : ""}<div style="margin-top:34px;border-top:1px solid #292721;padding-top:22px;color:#77736c;font-size:12px;line-height:1.7">${address.map(escapeHtml).join("<br>")}</div></td></tr></table></td></tr></table></td></tr></table></body></html>`;
  return { subject: content.subject, text, html };
}

async function sendRecurringEmail(variant: RecurringEmailVariant, details: RecurringEmailDetails) {
  const message = await buildRecurringEmail(variant, details);
  await sendCustomerEmail({
    to: details.to,
    customerId: details.customerId,
    customerName: details.customerName,
    emailType: EMAIL_TYPES[variant],
    metadata: {
      recurring_booking_id: details.recurringBookingId ?? null,
      service_name: details.serviceName,
      frequency: details.frequency,
      starts_on: details.startsOn,
      ends_on: details.endsOn,
    },
    ...message,
  });
}

export const sendRecurringBookingConfirmationEmail = (details: RecurringEmailDetails) => sendRecurringEmail("confirmed", details);
export const sendRecurringBookingUpdatedEmail = (details: RecurringEmailDetails) => sendRecurringEmail("updated", details);
export const sendRecurringBookingRemovedEmail = (details: RecurringEmailDetails) => sendRecurringEmail("removed", details);
export const sendRecurringBookingPausedEmail = (details: RecurringEmailDetails) => sendRecurringEmail("paused", details);
export const sendRecurringBookingResumedEmail = (details: RecurringEmailDetails) => sendRecurringEmail("resumed", details);
