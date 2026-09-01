import "server-only";

import type { CustomerRecord } from "@/lib/customers/types";
import { canReceiveMarketingEmail } from "@/lib/customers/marketing-consent";
import { sendGmailMessage } from "../gmail";
import { buildMarketingFooter } from "./footer";
import { createMarketingUnsubscribeToken } from "./unsubscribe-token";

export async function sendMarketingEmail(input: {
  customer: CustomerRecord;
  subject: string;
  html: string;
  text: string;
}) {
  if (!canReceiveMarketingEmail(input.customer)) {
    return { sent: false, reason: "not_eligible" as const };
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://1200hairstudio.com";
  const token = createMarketingUnsubscribeToken(input.customer.id);
  const unsubscribeUrl = `${baseUrl.replace(/\/$/, "")}/unsubscribe/${encodeURIComponent(token)}`;
  const footer = buildMarketingFooter(unsubscribeUrl);

  await sendGmailMessage({
    to: input.customer.email,
    subject: input.subject,
    html: `${input.html}${footer.html}`,
    text: `${input.text}${footer.text}`,
  });

  return { sent: true, reason: null };
}
