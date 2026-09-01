import "server-only";

import { google } from "googleapis";
import { formatZurichDate, formatZurichTimeRange } from "@/lib/appointments/availability";
import { formatServicePrice } from "@/lib/public/services";

const GMAIL_SENDER_EMAIL = "1200hairstudio@gmail.com";
const GMAIL_SENDER_NAME = "1200 Hairstudio";

type BookingEmailDetails = {
  to: string;
  customerName: string;
  serviceName: string;
  startAt: string;
  endAt: string;
  price: number;
};

export type GmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

function getRequiredEnv(name: "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET" | "GOOGLE_REFRESH_TOKEN") {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing ${name}.`);
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

function buildMessage({ to, subject, html, text }: GmailMessage) {
  const boundary = `1200hairstudio-${Date.now()}`;
  const message = [
    `From: ${GMAIL_SENDER_NAME} <${GMAIL_SENDER_EMAIL}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
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
  ].join("\r\n");

  return Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function sendGmailMessage(message: GmailMessage) {
  const gmail = createGmailClient();

  await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: buildMessage(message),
    },
  });
}

function buildBookingSummary(details: BookingEmailDetails) {
  const durationMinutes = Math.max(
    0,
    Math.round(
      (new Date(details.endAt).getTime() - new Date(details.startAt).getTime()) / 60_000,
    ),
  );

  return {
    customerName: details.customerName,
    serviceName: details.serviceName,
    dateLabel: formatZurichDate(details.startAt),
    timeLabel: formatZurichTimeRange(details.startAt, details.endAt),
    priceLabel: formatServicePrice(details.price),
    durationLabel: durationMinutes > 0 ? `${durationMinutes} min` : "By arrangement",
  };
}

type EmailTemplateContent = {
  statusLabel: string;
  headline: string;
  body: string;
  ctaLabel?: string;
  ctaHref?: string;
};

function buildPlainTextEmail(summary: ReturnType<typeof buildBookingSummary>, content: EmailTemplateContent) {
  return [
    `Hi ${summary.customerName},`,
    "",
    content.headline,
    content.body,
    "",
    `Service: ${summary.serviceName}`,
    `Date: ${summary.dateLabel}`,
    `Time: ${summary.timeLabel}`,
    `Duration: ${summary.durationLabel}`,
    `Price: ${summary.priceLabel}`,
    content.ctaHref ? "" : "",
    content.ctaHref ? `${content.ctaLabel ?? "Manage Appointment"}: ${content.ctaHref}` : "",
    "",
    GMAIL_SENDER_NAME,
    "Schulstrasse 2",
    "8599 Salmsach, Switzerland",
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
) {
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
                                  Appointment Details
                                </div>
                                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                  <tr>
                                    ${renderDetailItem("Customer", summary.customerName)}
                                    ${renderDetailItem("Service", summary.serviceName)}
                                  </tr>
                                  <tr>
                                    ${renderDetailItem("Date", summary.dateLabel)}
                                    ${renderDetailItem("Time", summary.timeLabel)}
                                  </tr>
                                  <tr>
                                    ${renderDetailItem("Duration", summary.durationLabel)}
                                    ${renderDetailItem("Price", summary.priceLabel)}
                                  </tr>
                                </table>
                              </td>
                            </tr>
                          </table>

                          ${ctaHtml}

                          <div style="padding-top: 34px; font-size: 12px; line-height: 1.8; color: #7d7d79; border-top: 1px solid #232323; margin-top: 34px;">
                            1200 Hairstudio<br />
                            Schulstrasse 2<br />
                            8599 Salmsach, Switzerland
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
  const summary = buildBookingSummary(details);
  const content = {
    statusLabel: "Appointment Confirmed",
    headline: "Your booking is locked in.",
    body: "We have reserved your appointment and prepared your session details below.",
    ctaLabel: "Manage Appointment",
    ctaHref: "https://1200hairstudio.com/account",
  } satisfies EmailTemplateContent;

  await sendGmailMessage({
    to: details.to,
    subject: `Booking confirmed: ${summary.serviceName}`,
    text: buildPlainTextEmail(summary, content),
    html: buildEmailHtml(summary, content),
  });
}

export async function sendBookingCancellationEmail(details: BookingEmailDetails) {
  const summary = buildBookingSummary(details);
  const content = {
    statusLabel: "Appointment Cancelled",
    headline: "This booking is no longer scheduled.",
    body: "Your appointment has been cancelled. If you want to return to the chair, you can book a new time whenever it suits you.",
    ctaLabel: "Manage Appointment",
    ctaHref: "https://1200hairstudio.com/account",
  } satisfies EmailTemplateContent;

  await sendGmailMessage({
    to: details.to,
    subject: `Booking cancelled: ${summary.serviceName}`,
    text: buildPlainTextEmail(summary, content),
    html: buildEmailHtml(summary, content),
  });
}

export async function sendBookingUpdateEmail(details: BookingEmailDetails) {
  const summary = buildBookingSummary(details);
  const content = {
    statusLabel: "Appointment Updated",
    headline: "Your booking details have changed.",
    body: "We have updated your appointment. Please review the latest schedule information below.",
    ctaLabel: "Manage Appointment",
    ctaHref: "https://1200hairstudio.com/account",
  } satisfies EmailTemplateContent;

  await sendGmailMessage({
    to: details.to,
    subject: `Booking updated: ${summary.serviceName}`,
    text: buildPlainTextEmail(summary, content),
    html: buildEmailHtml(summary, content),
  });
}
