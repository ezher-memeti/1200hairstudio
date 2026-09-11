import "server-only";

import { sendCustomerEmail } from "@/lib/email/gmail";
import type { ReceiptRecord } from "@/lib/receipts/types";
import { getBusinessSettings } from "@/lib/admin/runtime-settings";

export async function sendReceiptEmail(input: {
  to: string;
  customerId?: string | null;
  customerName?: string | null;
  receipt: ReceiptRecord;
  pdf: Uint8Array;
}) {
  const business = await getBusinessSettings();
  const address = [business.addressLine, [business.postalCode, business.city, business.region].filter(Boolean).join(" "), business.country].filter(Boolean);
  const receiptLabel = `BELEG ${input.receipt.receipt_number}`;
  const filename = `1200-hairstudio-beleg-${input.receipt.receipt_number}.pdf`;
  await sendCustomerEmail({
    to: input.to,
    customerId: input.customerId,
    appointmentId: input.receipt.appointment_id,
    customerName: input.customerName,
    emailType: "receipt",
    metadata: {
      receipt_id: input.receipt.id,
      receipt_number: input.receipt.receipt_number,
    },
    subject: `${receiptLabel} · ${business.businessName}`,
    text: `Vielen Dank für Ihren Besuch. Ihr ${receiptLabel} befindet sich im Anhang.`,
    html: `<div style="margin:0;background:#080808;padding:32px 16px;color:#f3f1eb;font-family:Arial,sans-serif"><div style="max-width:580px;margin:0 auto;border:1px solid #28251f;background:#111;padding:36px"><div style="font-size:38px;font-weight:700;letter-spacing:-2px">1200</div><div style="margin-top:8px;font-size:10px;letter-spacing:4px;color:#a79f92">HAIRSTUDIO</div><p style="margin-top:34px;font-size:11px;letter-spacing:3px;color:#c8a96b">${receiptLabel}</p><h1 style="font-size:26px;font-weight:500">Vielen Dank für Ihren Besuch.</h1><p style="color:#aaa;line-height:1.7">Ihre Quittung ist als PDF angehängt.</p><div style="margin-top:32px;border-top:1px solid #28251f;padding-top:22px;color:#777;font-size:12px;line-height:1.7">${[business.businessName, ...address].join("<br>")}</div></div></div>`,
    attachments: [{ filename, mimeType: "application/pdf", content: input.pdf }],
  });
}
