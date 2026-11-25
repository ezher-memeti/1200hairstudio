import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return { id: "/", name: "1200 HAIRSTUDIO", short_name: "1200 Studio", start_url: "/admin", scope: "/", display: "standalone", background_color: "#0d0d0d", theme_color: "#0d0d0d", icons: [
    { src: "/icons/favicon-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icons/app-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  ] };
}
