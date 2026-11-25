import { textFor } from "@/i18n/text";

const messages: Record<string, string> = {
  marketing_content_required: "Complete the campaign name, subject, headline and message in the selected content language before sending.",
  marketing_subject_invalid: "Use a single-line subject without email headers or line breaks.",
  marketing_cta_invalid: "Use a valid http:// or https:// CTA URL, or leave it empty.",
  marketing_recipient_invalid: "Your admin account needs a valid email address to receive a test.",
  marketing_locale_invalid: "Select English or German as the content language.",
  gmail_configuration_missing: "Gmail configuration is missing in this server process. Check the server environment and restart the development server.",
  invalid_grant: "Google rejected the mail authorization grant. Check the server credentials; do not replace a token that already validates without checking the server environment first.",
  invalid_client: "The server's Google OAuth client configuration was rejected. Check that it matches the validated configuration.",
  gmail_permission_denied: "Gmail rejected sending permission. Check the authorized sender and permitted sending aliases.",
  gmail_api_disabled: "Enable the Gmail API in the configured Google Cloud project.",
  gmail_rate_limited: "Gmail's sending limit was reached. Check the delivery status before retrying.",
  gmail_authentication_failed: "Gmail rejected this server's authentication. Compare the server environment with the validated configuration.",
};

export function marketingDeliveryMessage(error: unknown, locale: string, stage: "authorization" | "validation" | "rendering" | "delivery" | "campaign") {
  const code = error && typeof error === "object" && "code" in error ? error.code : null;
  const fallback = stage === "authorization" ? "Your admin session could not be verified. Sign in again."
    : stage === "rendering" ? "The marketing template could not be rendered. Check the selected language's content."
    : stage === "campaign" ? "The campaign could not be recorded or completed. Check its recorded status before retrying."
    : "Gmail did not confirm acceptance of the message. Check the server diagnostics and delivery status before retrying.";
  return textFor(locale, typeof code === "string" && Object.prototype.hasOwnProperty.call(messages, code) ? messages[code] : fallback);
}
