import { requireCustomerUser } from "@/lib/auth/customer";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateReceiptPdf } from "@/lib/receipts/server";
import type { ReceiptRecord } from "@/lib/receipts/types";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { supabase } = await requireCustomerUser();
  const response = await supabase.rpc("get_my_customer");
  const customer = Array.isArray(response.data) ? response.data[0] : response.data;

  if (!customer) return new Response("Receipt not found.", { status: 404 });

  const adminSupabase = createAdminClient();
  const { data: receipt } = await adminSupabase
    .from("receipts")
    .select("*")
    .eq("id", id)
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
