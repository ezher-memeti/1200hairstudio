import "server-only";
import { localizedServiceName } from "@/i18n/content";
import { getNotificationLocale } from "@/i18n/notifications";
import { textFor } from "@/i18n/text";
import { intlLocale, localizedPath } from "@/i18n/config";

import { getRuntimeSettings } from "@/lib/admin/runtime-settings";
import { getSiteUrl } from "@/lib/auth/url";
import { sendCustomerEmail } from "@/lib/email/gmail";

type AppointmentReminderEmail = {
  to: string;
  customerId?: string | null;
  appointmentId: string;
  customerName?: string | null;
  serviceName: string;
  serviceNameDe?: string | null;
  startAt: string;
  endAt: string;
  registeredCustomer: boolean;
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);

export async function sendAppointmentReminderEmail(details: AppointmentReminderEmail) {
  const locale = await getNotificationLocale(details);
  const t = (value: string) => textFor(locale, value);
  const serviceName = localizedServiceName(locale, details.serviceName, details.serviceNameDe);
  const { business } = await getRuntimeSettings();
  const start = new Date(details.startAt);
  const end = new Date(details.endAt);
  const date = new Intl.DateTimeFormat(intlLocale(locale), { timeZone: "Europe/Zurich", weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(start);
  const time = `${new Intl.DateTimeFormat(intlLocale(locale), { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit", hour12: false }).format(start)} – ${new Intl.DateTimeFormat(intlLocale(locale), { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit", hour12: false }).format(end)}`;
  const customerName = details.customerName?.trim() || "Customer";
  const address = [business.businessName, business.addressLine, [business.postalCode, business.city, business.region].filter(Boolean).join(" ")].filter(Boolean);
  const href = details.registeredCustomer ? `${getSiteUrl()}${localizedPath("/account", locale)}` : `${getSiteUrl()}/${locale}`;
  const subject = `${t("Appointment reminder")} — ${business.businessName || "1200 Hairstudio"}`;
  const text = [`${business.businessName}`, t("APPOINTMENT REMINDER"), "", `${t("Hi")} ${customerName},`, t("Your appointment is coming up."), "", serviceName, date, time, "", ...address, "", `${t("View appointment")}: ${href}`].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#070707;color:#f4f0e8"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#070707;padding:24px 0"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px"><tr><td style="padding:0 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #292721;background:#10100f"><tr><td style="padding:38px 34px;font-family:Arial,sans-serif"><div style="font-size:42px;font-weight:700;letter-spacing:-.06em">1200</div><div style="margin-top:8px;color:#918b80;font-size:10px;letter-spacing:.42em">HAIRSTUDIO</div><div style="margin-top:34px;color:#c9a56a;font-size:10px;letter-spacing:.28em;text-transform:uppercase">${t("Appointment Reminder")}</div><h1 style="margin:14px 0 0;font-family:Georgia,serif;font-size:34px;line-height:1.08;font-weight:400;text-transform:uppercase">${t("Your appointment is coming up.")}</h1><p style="margin:18px 0 0;color:#aaa69e;font-size:15px;line-height:1.7">${t("Hi")} ${escapeHtml(customerName)}, ${t("here are the details of your upcoming visit.")}</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:30px;border:1px solid #292721;background:#151513"><tr><td style="padding:24px"><div style="font-family:Georgia,serif;font-size:27px;text-transform:uppercase">${escapeHtml(serviceName)}</div><div style="margin-top:18px;color:#c9a56a;font-size:11px;letter-spacing:.16em;text-transform:uppercase">${escapeHtml(date)}</div><div style="margin-top:8px;font-size:17px">${escapeHtml(time)}</div></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:28px"><tr><td style="border:1px solid #c9a56a"><a href="${escapeHtml(href)}" style="display:inline-block;padding:15px 20px;color:#c9a56a;font-size:10px;font-weight:600;letter-spacing:.2em;text-decoration:none;text-transform:uppercase">${t("View Appointment →")}</a></td></tr></table><div style="margin-top:34px;border-top:1px solid #292721;padding-top:22px;color:#77736c;font-size:12px;line-height:1.7">${address.map((line) => escapeHtml(line)).join("<br>")}</div></td></tr></table></td></tr></table></td></tr></table></body></html>`;
  await sendCustomerEmail({
    to: details.to,
    customerId: details.customerId,
    appointmentId: details.appointmentId,
    customerName: details.customerName,
    emailType: "appointment_reminder",
    subject,
    text,
    html,
    metadata: { appointment_start_at: details.startAt },
  });
}
