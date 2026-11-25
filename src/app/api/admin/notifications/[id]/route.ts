import { handleNotifications } from "@/lib/notifications/server";
export const runtime = "nodejs";
export function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return context.params.then(({ id }) => handleNotifications(request, "read", id));
}
