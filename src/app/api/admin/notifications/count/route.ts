import { handleNotifications } from "@/lib/notifications/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request) { return handleNotifications(request, "count"); }
