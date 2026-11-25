import { redirect } from "@/i18n/server";
import { DM_Sans, Manrope } from "next/font/google";
import LoginForm from "@/components/admin/LoginForm";
import Footer from "@/components/layout/Footer";
import Header from "@/components/layout/Header";
import { getCurrentUserRole } from "@/lib/auth/customer";

import { isPushId } from "@/lib/push/preferences";

const adminDisplayFont = DM_Sans({
  subsets: ["latin"],
  variable: "--font-admin-display",
  weight: ["500", "600", "700"],
});

const adminPrimaryFont = Manrope({
  subsets: ["latin"],
  variable: "--font-admin-primary",
  weight: ["400", "500", "600", "700"],
});

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ push?: string }> }) {
  const intent = (await searchParams).push;
  const pushId = isPushId(intent) ? intent : undefined;
  const { user, role } = await getCurrentUserRole();

  if (user) {
    return await redirect(role === "admin" ? (pushId ? `/admin/push/${pushId}` : "/admin") : "/account");
  }

  return (
    <>
      <Header />
      <main
        className={`${adminDisplayFont.variable} ${adminPrimaryFont.variable} admin-theme bg-background font-admin-primary`}
      >
        <section className="page-container flex min-h-[calc(100vh-9rem)] items-center py-12 sm:py-16">
          <LoginForm pushId={pushId} />
        </section>
      </main>
      <Footer />
    </>
  );
}
