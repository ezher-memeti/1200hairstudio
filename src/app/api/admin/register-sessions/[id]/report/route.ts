import { getClosedRegisterDetail } from "@/lib/register/server";
import { generateRegisterClosingPdf, registerReportHtml } from "@/lib/register/report";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getClosedRegisterDetail(id);
  if (!detail) return new Response("Closed register session not found.", { status: 404 });
  const format = new URL(request.url).searchParams.get("format") ?? "view";
  if (format === "pdf") {
    const pdf = await generateRegisterClosingPdf(detail);
    return new Response(Buffer.from(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="1200-register-${detail.session.id}.pdf"`, "Cache-Control": "private, no-store" } });
  }
  return new Response(registerReportHtml(detail, format === "print"), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" } });
}
