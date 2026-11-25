import { handleNotifications } from "@/lib/notifications/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function POST(request: Request) { return handleNotifications(request, "read-all"); }
