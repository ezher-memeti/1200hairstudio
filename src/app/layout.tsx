import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "1200 Barbershop",
  description: "1200 Barbershop",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${displayFont.variable} ${primaryFont.variable} bg-background text-foreground font-primary`}
      >
        {children}
      </body>
    </html>
  );
}
