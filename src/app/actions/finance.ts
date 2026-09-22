"use server";

import { revalidatePath } from "next/cache";
import { requireAdminUser } from "@/lib/auth/customer";
import { sendReceiptEmail } from "@/lib/email/receipt";
import { generateReceiptPdf, getAdminReceipt, getOrCreateReceipt } from "@/lib/receipts/server";

export async function resendAdminReceipt(receiptId: string) {
  try {
    const { supabase } = await requireAdminUser();
    const receipt = await getAdminReceipt(supabase, receiptId);
    if (!receipt) return { error: "Receipt not found." };
    if (!receipt.customer_email) return { error: "This customer does not have an email address." };
    await sendReceiptEmail({
      to: receipt.customer_email,
      customerId: receipt.customer_id,
      customerName: receipt.customer_name,
      receipt,
      pdf: await generateReceiptPdf(receipt),
    });
    const emailedAt = new Date().toISOString();
    const { error } = await supabase.from("receipts").update({ emailed_at: emailedAt }).eq("id", receipt.id);
    if (error) return { error: "Receipt was sent, but its email status could not be updated." };
    revalidatePath("/admin/finance");
    revalidatePath("/admin/appointments");
    return { error: null, emailedAt };
  } catch (error) {
    console.error("ADMIN RECEIPT RESEND ERROR", error);
    return { error: "The receipt email could not be sent." };
  }
}

export async function generateAdminReceiptForAppointment(appointmentId: string) {
  try {
    if (!appointmentId) return { error: "Appointment not found.", receipt: null };
    const { supabase, user } = await requireAdminUser();
    const receipt = await getOrCreateReceipt(supabase, appointmentId, user.id);
    revalidatePath("/admin/finance");
    revalidatePath("/admin/appointments");
    return { error: null, receipt };
  } catch (error) {
    console.error("ADMIN RECEIPT GENERATION ERROR", error);
    return { error: error instanceof Error ? error.message : "The receipt could not be generated.", receipt: null };
  }
}
