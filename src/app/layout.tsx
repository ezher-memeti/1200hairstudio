import AnalyticsConsent from "@/components/analytics/AnalyticsConsent";
import { getSiteMode } from "@/lib/site-mode";
import { getSiteUrl } from "@/lib/auth/url";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Cormorant_Garamond, Inter } from "next/font/google";
import "./globals.css";

const displayFont = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-display",
  weight: "500",
  adjustFontFallback: false,
});

const primaryFont = Inter({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-primary",
});

export { localizedMetadata as generateMetadata } from "@/i18n/metadata";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html lang={locale}>
      <body
        className={`${displayFont.variable} ${primaryFont.variable} bg-background text-foreground font-primary`}
      >
        <NextIntlClientProvider locale={locale} messages={messages} timeZone="Europe/Zurich">{children}<AnalyticsConsent measurementId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() ?? ""} production={process.env.NODE_ENV === "production" && (!process.env.VERCEL_ENV || process.env.VERCEL_ENV === "production")} origin={getSiteUrl()} siteMode={getSiteMode()} /></NextIntlClientProvider>
      </body>
    </html>
  );
}
