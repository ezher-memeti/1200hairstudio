import createNextIntlPlugin from "next-intl/plugin";
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() { return [{ source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }] }]; },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'rqavijckrxkecaxnyiex.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};

export default withNextIntl(nextConfig);
