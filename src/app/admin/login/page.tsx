import { redirect } from "next/navigation";
import LoginForm from "@/components/admin/LoginForm";
import Footer from "@/components/layout/Footer";
import Header from "@/components/layout/Header";
import { createClient } from "@/lib/supabase/server";

export default async function AdminLoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/admin");
  }

  return (
    <>
      <Header />
      <main className="bg-background">
        <section className="page-container flex min-h-[calc(100vh-9rem)] items-center py-12 sm:py-16">
          <LoginForm />
        </section>
      </main>
      <Footer />
    </>
  );
}
