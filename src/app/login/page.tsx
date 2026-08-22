import { redirect } from "next/navigation";
import PublicLoginForm from "@/components/auth/PublicLoginForm";
import Footer from "@/components/layout/Footer";
import Header from "@/components/layout/Header";
import { getCurrentUserRole } from "@/lib/auth/customer";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: {
    reset?: string;
  };
}) {
  const { user, role } = await getCurrentUserRole();

  if (user) {
    redirect(role === "admin" ? "/admin" : "/account");
  }

  return (
    <>
      <Header />
      <main className="bg-background">
        <section className="page-container flex min-h-[calc(100vh-9rem)] items-center py-12 sm:py-16">
          <PublicLoginForm
            initialMessage={
              searchParams?.reset === "success"
                ? "Your password has been updated. Please sign in."
                : ""
            }
          />
        </section>
      </main>
      <Footer />
    </>
  );
}
