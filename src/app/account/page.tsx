import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import CustomerAccountView from "@/components/account/CustomerAccountView";
import { ensureCustomerRecord } from "@/lib/auth/customer";

export default async function AccountPage() {
  const customer = await ensureCustomerRecord();

  return (
    <>
      <Header />
      <main className="bg-background">
        <section className="page-container py-12 sm:py-16 lg:py-20">
          <CustomerAccountView customer={customer} />
        </section>
      </main>
      <Footer />
    </>
  );
}
