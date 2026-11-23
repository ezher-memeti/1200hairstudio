import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/auth/url";
export const dynamic = "force-dynamic";
export default function robots(): MetadataRoute.Robots {
  return {
    // Let crawlers read noindex on private/temporary pages. Authentication, not
    // robots.txt, protects customer records. Rendering assets remain crawlable.
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/auth/"] },
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  };
}
