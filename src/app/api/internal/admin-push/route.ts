import { timingSafeEqual } from "node:crypto";
import { processAdminPush } from "@/lib/push/worker";
import { safeLogDetails } from "@/lib/logging";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(request: Request) {
  const secret = process.env.ADMIN_PUSH_JOB_SECRET?.trim();
  const expected = Buffer.from(`Bearer ${secret ?? ""}`), provided = Buffer.from(request.headers.get("authorization") ?? "");
  if (!secret || secret.length < 32 || expected.length !== provided.length || !timingSafeEqual(expected, provided)) return Response.json({ success: false }, { status: 401 });
  try { return Response.json({ success: true, ...await processAdminPush() }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { console.error("ADMIN PUSH JOB FAILED", safeLogDetails(error));return Response.json({ success: false, code: "queue_unavailable" }, { status: 503 }); }
}
