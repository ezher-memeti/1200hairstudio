import { handlePushApi } from "@/lib/push/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request) { return handlePushApi(request, "status"); }
export function POST(request: Request) { return handlePushApi(request, "subscribe"); }
export function DELETE(request: Request) { return handlePushApi(request, "unsubscribe"); }
