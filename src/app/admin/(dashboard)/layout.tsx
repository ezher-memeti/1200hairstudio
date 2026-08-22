import { redirect } from "next/navigation";
import { DM_Sans, Manrope } from "next/font/google";
import AdminShell from "@/components/admin/AdminShell";
import { requireAdminUser } from "@/lib/auth/customer";

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
  await requireAdminUser();

  return (
    <div
      className={`${adminDisplayFont.variable} ${adminPrimaryFont.variable} admin-theme font-admin-primary`}
    >
      <AdminShell>{children}</AdminShell>
    </div>
  );
}
