import { safeLogDetails } from "@/lib/logging";
import "server-only";
import { localizedServiceName } from "@/i18n/content";
import { getNotificationLocale } from "@/i18n/notifications";
import { textFor } from "@/i18n/text";
import { localizedPath, intlLocale, type Locale } from "@/i18n/config";

import { google } from "googleapis";
import { formatZurichDate, formatZurichTimeRange } from "@/lib/appointments/availability";
import { formatServicePrice } from "@/lib/public/services";
import { getSiteUrl, localizePublicUrl } from "@/lib/auth/url";
import { getRuntimeSettings } from "@/lib/admin/runtime-settings";
import { createAdminClient } from "@/lib/supabase/admin";

const GMAIL_SENDER_EMAIL = "1200hairstudio@gmail.com";
const DEFAULT_SENDER_NAME = "1200 Hairstudio";

type BookingEmailDetails = {
  customerId?: string | null;
  appointmentId?: string | null;
  to: string;
  customerName: string;
  serviceName: string;
  serviceNameDe?: string | null;
  startAt: string;
  endAt: string;
  price: number;
  bookingReference?: string;
  manageUrl?: string;
};

export type GmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: Array<{
    filename: string;
    mimeType: string;
    content: Uint8Array;
  }>;
};

export const CUSTOMER_EMAIL_TYPES = ["appointment_confirmation", "appointment_rescheduled", "appointment_cancelled", "appointment_reminder", "regular_booking_confirmation", "regular_booking_updated", "regular_booking_removed", "regular_booking_paused", "regular_booking_resumed", "receipt", "marketing", "other"] as const;
export type CustomerEmailType = (typeof CUSTOMER_EMAIL_TYPES)[number];
export type CustomerEmailMessage = GmailMessage & { customerId?: string | null; appointmentId?: string | null; customerName?: string | null; emailType: CustomerEmailType; metadata?: Record<string, unknown> };

function getRequiredEnv(name: "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET" | "GOOGLE_REFRESH_TOKEN") {
  const value = process.env[name]?.trim();

  if (!value) {
    throw Object.assign(new Error(`Missing ${name}.`), { code: "gmail_configuration_missing" });
  }

  return value;
}

function createGmailClient() {
  const oauth2Client = new google.auth.OAuth2(
    getRequiredEnv("GOOGLE_CLIENT_ID"),
    getRequiredEnv("GOOGLE_CLIENT_SECRET"),
  );

  oauth2Client.setCredentials({
    refresh_token: getRequiredEnv("GOOGLE_REFRESH_TOKEN"),
  });

  return google.gmail({
    version: "v1",
    auth: oauth2Client,
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildMessage({ to, subject, html, text, attachments = [] }: GmailMessage, senderName: string) {
  const boundary = `1200hairstudio-${Date.now()}`;
  const alternativeBoundary = `${boundary}-alternative`;
  const body = attachments.length
    ? [
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        "",
        `--${boundary}`,
        `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
        "",
        `--${alternativeBoundary}`,
        'Content-Type: text/plain; charset="UTF-8"',
        "Content-Transfer-Encoding: 8bit",
        "",
        text,
        `--${alternativeBoundary}`,
        'Content-Type: text/html; charset="UTF-8"',
        "Content-Transfer-Encoding: 8bit",
        "",
        html,
        `--${alternativeBoundary}--`,
        ...attachments.flatMap((attachment) => [
          `--${boundary}`,
          `Content-Type: ${attachment.mimeType}; name="${attachment.filename}"`,
          "Content-Transfer-Encoding: base64",
          `Content-Disposition: attachment; filename="${attachment.filename}"`,
          "",
          Buffer.from(attachment.content).toString("base64").match(/.{1,76}/g)?.join("\r\n") ?? "",
        ]),
        `--${boundary}--`,
      ]
    : [
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
        "",
        `--${boundary}`,
        'Content-Type: text/plain; charset="UTF-8"',
        "",
        text,
        `--${boundary}`,
        'Content-Type: text/html; charset="UTF-8"',
        "",
        html,
        `--${boundary}--`,
      ];
  const message = [
    `From: ${senderName} <${GMAIL_SENDER_EMAIL}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    ...body,
  ].join("\r\n");

  return Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Return only fixed diagnostics; SDK errors may contain credentials and full emails. */
export function sanitizeGmailError(error: unknown) {
  const detail = error as { code?: unknown; response?: { status?: unknown; data?: { error?: unknown } } } | null;
  const rawStatus = detail?.response?.status;
  const status = typeof rawStatus === "number" && Number.isInteger(rawStatus) && rawStatus >= 100 && rawStatus <= 599 ? rawStatus : undefined;
  const providerError = detail?.response?.data?.error;
  const oauthCode = typeof providerError === "string" ? providerError : detail?.code;
  const reasons = providerError && typeof providerError === "object" && "errors" in providerError && Array.isArray(providerError.errors)
    ? providerError.errors.map((item: unknown) => item && typeof item === "object" && "reason" in item ? item.reason : null)
    : [];
  let code = "gmail_delivery_failed";
  let guidance = "Check Gmail service availability.";
  if (oauthCode === "gmail_configuration_missing") {
    code = "gmail_configuration_missing";
    guidance = "Configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REFRESH_TOKEN in the server environment.";
  } else if (oauthCode === "invalid_grant") {
    code = "invalid_grant";
    guidance = "Google rejected the refresh grant. Check the OAuth client/token pairing; reauthorization may be required for an expired or revoked token.";
  } else if (oauthCode === "invalid_client") {
    code = "invalid_client";
    guidance = "Check the configured Google OAuth client credentials.";
  } else if (reasons.includes("accessNotConfigured")) {
    code = "gmail_api_disabled";
    guidance = "Enable the Gmail API in the OAuth client's Google Cloud project.";
  } else if (status === 429 || reasons.some(reason => ["rateLimitExceeded", "userRateLimitExceeded", "dailyLimitExceeded", "quotaExceeded"].includes(String(reason)))) {
    code = "gmail_rate_limited";
    guidance = "Gmail quota or rate limit reached; do not automatically resend an ambiguously accepted message.";
  } else if (status === 403) {
    code = "gmail_permission_denied";
    guidance = "Check gmail.send permission and Google account or Workspace restrictions.";
  } else if (status === 401) {
    code = "gmail_authentication_failed";
    guidance = "Check Gmail OAuth credentials and granted permissions.";
  }
  return Object.assign(new Error(`Gmail message submission failed${status ? ` (HTTP ${status})` : ""}. ${guidance}`), { code, status });
}

export async function sendGmailMessage(message: GmailMessage) {
  try {
    const gmail = createGmailClient();
    const settings = await getRuntimeSettings();
    const senderName = settings.notifications.senderName.trim() || settings.business.businessName.trim() || DEFAULT_SENDER_NAME;
    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: buildMessage(message, senderName),
      },
    });
    if (!response.data.id) throw new Error("Missing Gmail message ID.");
    return { providerMessageId: response.data.id };
  } catch (error) {
    const failure = sanitizeGmailError(error);
    // Fixed code/status only: never serialize the original SDK error or email.
    console.error("GMAIL DELIVERY ERROR", safeLogDetails(failure));
    throw failure;
  }
}

export async function sendCustomerEmail(message: CustomerEmailMessage) {
  const admin = createAdminClient();
  const recipientEmail = message.to.trim().toLowerCase();
  const metadata = { ...(message.metadata ?? {}), ...(message.customerName ? { customer_name: message.customerName } : {}) };
  const { data: log, error: logError } = await admin.from("customer_email_logs").insert({ customer_id: message.customerId ?? null, appointment_id: message.appointmentId ?? null, recipient_email: recipientEmail, email_type: message.emailType, subject: message.subject, status: "processing", metadata }).select("id").single();
  if (logError || !log) {
    console.error("CUSTOMER EMAIL LOG CREATION ERROR", safeLogDetails({ appointmentId: message.appointmentId ?? null, error: logError }));
    throw new Error("Unable to initialize customer email delivery.");
  }
  try {
    const delivery = await sendGmailMessage({ to: recipientEmail, subject: message.subject, html: message.html, text: message.text, attachments: message.attachments });
    const sentAt = new Date().toISOString();
    const { error } = await admin.from("customer_email_logs").update({ status: "sent", sent_at: sentAt, failed_at: null, error_message: null, provider_message_id: delivery.providerMessageId }).eq("id", log.id);
    if (error) console.error("CRITICAL: CUSTOMER EMAIL SENT BUT LOG UPDATE FAILED", safeLogDetails({ emailLogId: log.id, error }));
    return { ...delivery, emailLogId: log.id };
  } catch (error) {
    const failedAt = new Date().toISOString();
    const errorMessage = error instanceof Error ? error.message.slice(0, 1000) : "Email delivery failed.";
    const { error: updateError } = await admin.from("customer_email_logs").update({ status: "failed", failed_at: failedAt, sent_at: null, error_message: errorMessage }).eq("id", log.id);
    if (updateError) console.error("CRITICAL: CUSTOMER EMAIL FAILURE LOG UPDATE FAILED", safeLogDetails({ emailLogId: log.id, error: updateError, deliveryError: error }));
    throw error;
  }
}

function buildBookingSummary(details: BookingEmailDetails, locale: Locale = "de") {
  const durationMinutes = Math.max(
    0,
    Math.round(
      (new Date(details.endAt).getTime() - new Date(details.startAt).getTime()) / 60_000,
    ),
  );

  return {
    customerName: details.customerName,
    serviceName: localizedServiceName(locale, details.serviceName, details.serviceNameDe),
    dateLabel: new Intl.DateTimeFormat(intlLocale(locale), { timeZone: "Europe/Zurich", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(details.startAt)),
    locale,
    timeLabel: formatZurichTimeRange(details.startAt, details.endAt),
    priceLabel: formatServicePrice(details.price),
    durationLabel: durationMinutes > 0 ? `${durationMinutes} min` : "By arrangement",
    bookingReference: details.bookingReference,
  };
}

type EmailBranding = {
  businessName: string;
  addressLines: string[];
};

async function getEmailBranding(): Promise<EmailBranding> {
  const { business } = await getRuntimeSettings();
  return {
    businessName: business.businessName.trim() || DEFAULT_SENDER_NAME,
    addressLines: [
      business.addressLine,
      [business.postalCode, business.city, business.region].filter(Boolean).join(" "),
      business.country,
    ].map((value) => value.trim()).filter(Boolean),
  };
}

type EmailTemplateContent = {
  statusLabel: string;
  headline: string;
  body: string;
  ctaLabel?: string;
  ctaHref?: string;
};

function buildPlainTextEmail(summary: ReturnType<typeof buildBookingSummary>, content: EmailTemplateContent, branding: EmailBranding) {
  const t = (value: string) => textFor(summary.locale, value);
  return [
    `${t("Hi")} ${summary.customerName},`,
    "",
    content.headline,
    content.body,
    "",
    `${t("Service")} : ${summary.serviceName}`,
    `${t("Date")} : ${summary.dateLabel}`,
    `${t("Time")} : ${summary.timeLabel}`,
    `${t("Duration")} : ${summary.durationLabel}`,
    `${t("Price")} : ${summary.priceLabel}`,
    summary.bookingReference ? `${t("Booking reference")} : ${summary.bookingReference}` : "",
    content.ctaHref ? "" : "",
    content.ctaHref ? `${content.ctaLabel ?? "Manage Appointment"}: ${content.ctaHref}` : "",
    "",
    branding.businessName,
    ...branding.addressLines,
  ]
    .filter(Boolean)
    .join("\n");
}

function renderDetailItem(label: string, value: string) {
  return `
    <td style="padding: 0 10px 18px 0; vertical-align: top; width: 50%;">
      <div style="font-size: 11px; line-height: 1.4; letter-spacing: 0.22em; text-transform: uppercase; color: #8c8c8c; padding-bottom: 6px;">
        ${escapeHtml(label)}
      </div>
      <div style="font-size: 15px; line-height: 1.6; color: #f3f3f1;">
        ${escapeHtml(value)}
      </div>
    </td>
  `;
}

function buildEmailHtml(
  summary: ReturnType<typeof buildBookingSummary>,
  content: EmailTemplateContent,
  branding: EmailBranding,
) {
  const t = (value: string) => textFor(summary.locale, value);
  const ctaHtml =
    content.ctaHref && content.ctaLabel
      ? `
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top: 30px;">
          <tr>
            <td style="border: 1px solid #d6d0c4; background-color: #f3efe6;">
              <a
                href="${escapeHtml(content.ctaHref)}"
                style="display: inline-block; padding: 14px 22px; font-size: 11px; line-height: 1; letter-spacing: 0.22em; text-transform: uppercase; color: #111111; text-decoration: none; font-weight: 600;"
              >
                ${escapeHtml(content.ctaLabel)}
              </a>
            </td>
          </tr>
        </table>
      `
      : "";

  return `
    <!doctype html>
    <html>
      <body style="margin: 0; padding: 0; background-color: #070707;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #070707; margin: 0; padding: 24px 0;">
          <tr>
            <td align="center">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 620px; margin: 0 auto;">
                <tr>
                  <td style="padding: 0 18px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border: 1px solid #232323; background-color: #0f0f0f;">
                      <tr>
                        <td style="padding: 38px 34px 34px 34px;">
                          <div style="font-size: 44px; line-height: 0.95; letter-spacing: -0.06em; color: #f7f7f5; font-weight: 700;">
                            1200
                          </div>
                          <div style="padding-top: 10px; font-size: 11px; line-height: 1.2; letter-spacing: 0.42em; text-transform: uppercase; color: #8c8c8c;">
                            HAIRSTUDIO
                          </div>

                          <div style="padding-top: 30px; font-size: 11px; line-height: 1.4; letter-spacing: 0.24em; text-transform: uppercase; color: #a79f92;">
                            ${escapeHtml(content.statusLabel)}
                          </div>
                          <div style="padding-top: 14px; font-size: 30px; line-height: 1.1; letter-spacing: -0.04em; color: #f7f7f5; font-weight: 600;">
                            ${escapeHtml(content.headline)}
                          </div>
                          <div style="padding-top: 18px; max-width: 470px; font-size: 15px; line-height: 1.8; color: #b7b7b4;">
                            ${escapeHtml(content.body)}
                          </div>

                          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-top: 34px; border: 1px solid #232323; background-color: #141414;">
                            <tr>
                              <td style="padding: 24px 24px 8px 24px;">
                                <div style="font-size: 11px; line-height: 1.4; letter-spacing: 0.24em; text-transform: uppercase; color: #8c8c8c; padding-bottom: 18px;">
                                  ${t("Appointment Details")}
                                </div>
                                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                  <tr>
                                    ${renderDetailItem(t("Customer"), summary.customerName)}
                                    ${renderDetailItem(t("Service"), summary.serviceName)}
                                  </tr>
                                  <tr>
                                    ${renderDetailItem(t("Date"), summary.dateLabel)}
                                    ${renderDetailItem(t("Time"), summary.timeLabel)}
                                  </tr>
                                  <tr>
                                    ${renderDetailItem(t("Duration"), summary.durationLabel)}
                                    ${renderDetailItem(t("Price"), summary.priceLabel)}
                                  </tr>
                                  ${summary.bookingReference ? `<tr>${renderDetailItem(t("Booking Reference"), summary.bookingReference)}<td style="width: 50%;"></td></tr>` : ""}
                                </table>
                              </td>
                            </tr>
                          </table>

                          ${ctaHtml}

                          <div style="padding-top: 34px; font-size: 12px; line-height: 1.8; color: #7d7d79; border-top: 1px solid #232323; margin-top: 34px;">
                            ${escapeHtml(branding.businessName)}<br />
                            ${branding.addressLines.map(escapeHtml).join("<br />")}
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

export async function sendBookingConfirmationEmail(details: BookingEmailDetails) {
  const locale = await getNotificationLocale(details);
  const t = (value: string) => textFor(locale, value);
  const summary = buildBookingSummary(details, locale);
  const branding = await getEmailBranding();
  const content = {
    statusLabel: t('Appointment Confirmed'),
    headline: t('Your booking is locked in.'),
    body: t('We have reserved your appointment and prepared your session details below.'),
    ctaLabel: details.manageUrl ? t("Manage Booking →") : t("Manage Appointment"),
    ctaHref: details.manageUrl ? localizeEmailLink(details.manageUrl, locale) : `${getSiteUrl()}${localizedPath("/account", locale)}`,
  } satisfies EmailTemplateContent;

  await sendCustomerEmail({
    customerId: details.customerId,
    appointmentId: details.appointmentId,
    customerName: details.customerName,
    emailType: "appointment_confirmation",
    to: details.to,
    subject: `${t("Booking confirmed")} : ${summary.serviceName}`,
    text: buildPlainTextEmail(summary, content, branding),
    html: buildEmailHtml(summary, content, branding),
  });
}

export async function sendBookingCancellationEmail(details: BookingEmailDetails) {
  const locale = await getNotificationLocale(details);
  const t = (value: string) => textFor(locale, value);
  const summary = buildBookingSummary(details, locale);
  const branding = await getEmailBranding();
  const content = {
    statusLabel: t('Appointment Cancelled'),
    headline: t('This booking is no longer scheduled.'),
    body: t('Your appointment has been cancelled. If you want to return to the chair, you can book a new time whenever it suits you.'),
    ctaLabel: t('Manage Appointment'),
    ctaHref: `${getSiteUrl()}${localizedPath("/account", locale)}`,
  } satisfies EmailTemplateContent;

  await sendCustomerEmail({
    customerId: details.customerId,
    appointmentId: details.appointmentId,
    customerName: details.customerName,
    emailType: "appointment_cancelled",
    metadata: details.bookingReference ? { booking_reference: details.bookingReference } : {},
    to: details.to,
    subject: `${t("Booking cancelled")} : ${summary.serviceName}`,
    text: buildPlainTextEmail(summary, content, branding),
    html: buildEmailHtml(summary, content, branding),
  });
}

export async function sendBookingUpdateEmail(details: BookingEmailDetails) {
  const locale = await getNotificationLocale(details);
  const t = (value: string) => textFor(locale, value);
  const summary = buildBookingSummary(details, locale);
  const branding = await getEmailBranding();
  const content = {
    statusLabel: t('Appointment Updated'),
    headline: t('Your booking details have changed.'),
    body: t('We have updated your appointment. Please review the latest schedule information below.'),
    ctaLabel: t('Manage Appointment'),
    ctaHref: `${getSiteUrl()}${localizedPath("/account", locale)}`,
  } satisfies EmailTemplateContent;

  await sendCustomerEmail({
    customerId: details.customerId,
    appointmentId: details.appointmentId,
    customerName: details.customerName,
    emailType: "appointment_rescheduled",
    to: details.to,
    subject: `${t("Booking updated")} : ${summary.serviceName}`,
    text: buildPlainTextEmail(summary, content, branding),
    html: buildEmailHtml(summary, content, branding),
  });
}

export async function sendAdminBookingNotificationEmail(details: BookingEmailDetails & { adminEmail: string }) {
  const locale = await getNotificationLocale(details);
  const t = (value: string) => textFor(locale, value);
  const summary = buildBookingSummary(details, locale);
  const branding = await getEmailBranding();
  const content = {
    statusLabel: t('New Customer Booking'),
    headline: t('A new appointment was booked.'),
    body: `${summary.customerName} booked ${summary.serviceName}.`,
    ctaLabel: t('View Appointments →'),
    ctaHref: `${getSiteUrl()}${localizedPath("/admin/appointments", locale)}`,
  } satisfies EmailTemplateContent;
  await sendGmailMessage({
    to: details.adminEmail,
    subject: `New booking: ${summary.customerName} · ${summary.serviceName}`,
    text: buildPlainTextEmail(summary, content, branding),
    html: buildEmailHtml(summary, content, branding),
  });
}

function localizeEmailLink(value: string, locale: Locale) {
  return localizePublicUrl(value, locale);
}
