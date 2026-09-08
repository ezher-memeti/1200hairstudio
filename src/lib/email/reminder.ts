import "server-only";

import { getRuntimeSettings } from "@/lib/admin/runtime-settings";
import { getSiteUrl } from "@/lib/auth/url";
import { sendGmailMessage } from "@/lib/email/gmail";

type AppointmentReminderEmail = {
  to: string;
  customerName?: string | null;
  serviceName: string;
  startAt: string;
  endAt: string;
  registeredCustomer: boolean;
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);

export async function sendAppointmentReminderEmail(details: AppointmentReminderEmail) {
  const { business } = await getRuntimeSettings();
  const start = new Date(details.startAt);
  const end = new Date(details.endAt);
  const date = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Zurich", weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(start);
  const time = `${new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit", hour12: false }).format(start)} – ${new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit", hour12: false }).format(end)}`;
  const customerName = details.customerName?.trim() || "Customer";
  const address = [business.businessName, business.addressLine, [business.postalCode, business.city, business.region].filter(Boolean).join(" ")].filter(Boolean);
  const href = details.registeredCustomer ? `${getSiteUrl()}/account` : getSiteUrl();
  const subject = `Appointment reminder — ${business.businessName || "1200 Hairstudio"}`;
  const text = [`${business.businessName}`, "APPOINTMENT REMINDER", "", `Hi ${customerName},`, "Your appointment is coming up.", "", details.serviceName, date, time, "", ...address, "", `View appointment: ${href}`].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#070707;color:#f4f0e8"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#070707;padding:24px 0"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px"><tr><td style="padding:0 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #292721;background:#10100f"><tr><td style="padding:38px 34px;font-family:Arial,sans-serif"><div style="font-size:42px;font-weight:700;letter-spacing:-.06em">1200</div><div style="margin-top:8px;color:#918b80;font-size:10px;letter-spacing:.42em">HAIRSTUDIO</div><div style="margin-top:34px;color:#c9a56a;font-size:10px;letter-spacing:.28em;text-transform:uppercase">Appointment Reminder</div><h1 style="margin:14px 0 0;font-family:Georgia,serif;font-size:34px;line-height:1.08;font-weight:400;text-transform:uppercase">Your appointment is coming up.</h1><p style="margin:18px 0 0;color:#aaa69e;font-size:15px;line-height:1.7">Hi ${escapeHtml(customerName)}, here are the details of your upcoming visit.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:30px;border:1px solid #292721;background:#151513"><tr><td style="padding:24px"><div style="font-family:Georgia,serif;font-size:27px;text-transform:uppercase">${escapeHtml(details.serviceName)}</div><div style="margin-top:18px;color:#c9a56a;font-size:11px;letter-spacing:.16em;text-transform:uppercase">${escapeHtml(date)}</div><div style="margin-top:8px;font-size:17px">${escapeHtml(time)}</div></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:28px"><tr><td style="border:1px solid #c9a56a"><a href="${escapeHtml(href)}" style="display:inline-block;padding:15px 20px;color:#c9a56a;font-size:10px;font-weight:600;letter-spacing:.2em;text-decoration:none;text-transform:uppercase">View Appointment →</a></td></tr></table><div style="margin-top:34px;border-top:1px solid #292721;padding-top:22px;color:#77736c;font-size:12px;line-height:1.7">${address.map((line) => escapeHtml(line)).join("<br>")}</div></td></tr></table></td></tr></table></td></tr></table></body></html>`;
  await sendGmailMessage({ to: details.to, subject, text, html });
}
