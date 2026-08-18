import type { Metadata } from "next";
import "./globals.css";

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
      <body className="bg-background text-foreground">{children}</body>
    </html>
  );
}
