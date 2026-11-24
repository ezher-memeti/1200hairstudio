import type { Metadata } from "next";
import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { textFor } from "./text";
import { getSiteUrl } from "@/lib/auth/url";
import { resolveLocale } from "./config";
import { publicMetadata } from "@/lib/seo/metadata";
export async function localizedMetadata(): Promise<Metadata> {
  const locale = resolveLocale(await getLocale());
  const path = (await headers()).get("x-app-pathname") ?? `/${locale}`;
  const result = publicMetadata(getSiteUrl(), locale, path);
  const route = path.replace(/^\/(de|en)(?=\/|$)/, "") || "/";
  const privateLabels: Record<string, string> = { "/login": "Customer Login", "/register": "Create Your Account", "/forgot-password": "Forgot Password", "/reset-password": "Reset Your Password", "/account": "My Account", "/dashboard": "My Account", "/admin": "Dashboard", "/admin/login": "Admin Login" };
  if (privateLabels[route]) result.title = `${textFor(locale, privateLabels[route])} | 1200 HAIRSTUDIO`;
  return result;
}
