import { handleAuthForm } from "@/lib/auth/form-handler";
export const runtime = "nodejs";
export function POST(request: Request) { return handleAuthForm(request, "register"); }
