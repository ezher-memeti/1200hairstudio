import { handleNotifications } from "@/lib/notifications/server";
export const runtime = "nodejs";
export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return context.params.then(({ id }) => handleNotifications(request, "open", id));
}
