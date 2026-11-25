"use client";
// No lookup-only endpoint or privileged Supabase client is available to the browser.
export async function submitAuthForm(operation: "register" | "forgot-password", body: object) {
  const response = await fetch(`/api/auth/${operation}`, {
    method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { "Content-Type": "application/json", "x-auth-form": "1" }, body: JSON.stringify(body),
  });
  return response.json() as Promise<{ success: boolean; code?: string; hasSession?: boolean }>;
}
