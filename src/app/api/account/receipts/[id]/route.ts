import { requireCustomerUser } from "@/lib/auth/customer";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateReceiptPdf } from "@/lib/receipts/server";
import type { ReceiptRecord } from "@/lib/receipts/types";

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  const { supabase, user } = await requireCustomerUser();
  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!customer) return new Response("Receipt not found.", { status: 404 });

  const adminSupabase = createAdminClient();
  const { data: receipt } = await adminSupabase
    .from("receipts")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  if (!receipt) return new Response("Receipt not found.", { status: 404 });

  const { data: appointment } = await adminSupabase
    .from("appointments")
    .select("customer_id")
    .eq("id", receipt.appointment_id)
    .eq("customer_id", customer.id)
    .maybeSingle();

  if (!appointment) return new Response("Receipt not found.", { status: 404 });

  const pdf = await generateReceiptPdf(receipt as ReceiptRecord);
  const download = new URL(request.url).searchParams.get("download") === "1";

  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="1200-hairstudio-beleg-${receipt.receipt_number}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
