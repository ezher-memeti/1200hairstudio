import { handlePushApi } from "@/lib/push/api";
export const runtime = "nodejs";
export const maxDuration = 30;
export function POST(request: Request) { return handlePushApi(request, "test"); }
