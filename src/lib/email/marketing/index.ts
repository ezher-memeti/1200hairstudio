import "server-only";

import { getSiteUrl } from "@/lib/auth/url";

import type { CustomerRecord } from "@/lib/customers/types";
import { canReceiveMarketingEmail } from "@/lib/customers/marketing-consent";
import { sendCustomerEmail } from "../gmail";
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

  const baseUrl = getSiteUrl();
  const token = createMarketingUnsubscribeToken(input.customer.id);
  const unsubscribeUrl = `${baseUrl.replace(/\/$/, "")}/unsubscribe/${encodeURIComponent(token)}`;
  const footer = buildMarketingFooter(unsubscribeUrl);

  await sendCustomerEmail({
    to: input.customer.email,
    customerId: input.customer.id,
    customerName: input.customer.full_name,
    emailType: "marketing",
    metadata: { communication_category: "marketing" },
    subject: input.subject,
    html: `${input.html}${footer.html}`,
    text: `${input.text}${footer.text}`,
  });

  return { sent: true, reason: null };
}
