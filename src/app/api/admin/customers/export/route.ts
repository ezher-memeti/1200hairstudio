import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth/customer";
import {
  createAllCustomersCsv,
  createAllCustomersPdf,
  createCustomerCsv,
  createCustomerPdf,
} from "@/lib/customers/exports";
import { getAdminCustomerDirectory } from "@/lib/customers/queries";

export const dynamic = "force-dynamic";

function safeFilename(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "customer";
}

export async function GET(request: NextRequest) {
  await requireAdminUser();

  const format = request.nextUrl.searchParams.get("format");
  const customerId = request.nextUrl.searchParams.get("customerId");

  if (format !== "csv" && format !== "pdf") {
    return NextResponse.json({ error: "Unsupported export format." }, { status: 400 });
  }

  const customers = await getAdminCustomerDirectory();
  const customer = customerId
    ? customers.find((entry) => entry.id === customerId)
    : null;

  if (customerId && !customer) {
    return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  }

  const filename = customer ? safeFilename(customer.full_name) : "all-customers";
  if (format === "csv") {
    const csv = customer ? createCustomerCsv(customer) : createAllCustomersCsv(customers);
    return new NextResponse(`\uFEFF${csv}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  const pdf = customer ? await createCustomerPdf(customer) : await createAllCustomersPdf(customers);
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
