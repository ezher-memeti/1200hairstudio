import { redirect } from "next/navigation";
import { DM_Sans, Manrope } from "next/font/google";
import AdminShell from "@/components/admin/AdminShell";
import { createClient } from "@/lib/supabase/server";

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

export default async function AdminDashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  return (
    <div
      className={`${adminDisplayFont.variable} ${adminPrimaryFont.variable} admin-theme font-admin-primary`}
    >
      <AdminShell>{children}</AdminShell>
    </div>
  );
}
