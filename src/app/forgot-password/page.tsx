import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import PublicForgotPasswordForm from "@/components/auth/PublicForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <>
      <Header />
      <main className="bg-background">
        <section className="page-container flex min-h-[calc(100vh-9rem)] items-center py-12 sm:py-16">
          <PublicForgotPasswordForm />
        </section>
      </main>
      <Footer />
    </>
  );
}
