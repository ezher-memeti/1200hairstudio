import { redirect } from "next/navigation";
import PublicRegisterForm from "@/components/auth/PublicRegisterForm";
import Footer from "@/components/layout/Footer";
import Header from "@/components/layout/Header";
import { getCurrentUserRole } from "@/lib/auth/customer";

export default async function RegisterPage() {
  const { user, role } = await getCurrentUserRole();

  if (user) {
    redirect(role === "admin" ? "/admin" : "/account");
  }

  return (
    <>
      <Header />
      <main className="bg-background">
        <section className="page-container flex min-h-[calc(100vh-9rem)] items-center py-12 sm:py-16">
          <PublicRegisterForm />
        </section>
      </main>
      <Footer />
    </>
  );
}
