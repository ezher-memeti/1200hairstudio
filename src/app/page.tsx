import BookingSection from "@/components/home/BookingSection";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import Hero from "@/components/home/Hero";
import MeetTheBarber from "@/components/home/MeetTheBarber";
import SelectedWork from "@/components/home/SelectedWork";
import Services from "@/components/home/Services";
import ScrollVideoSection from "@/components/home/ScrollVideoSection";
import SectionTwo from "@/components/home/SectionTwo";
import VisitStudio from "@/components/home/VisitStudio";

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <ScrollVideoSection>
          <Hero />
          <SectionTwo />
        </ScrollVideoSection>
        <Services />
        <MeetTheBarber />
        <SelectedWork />
        <BookingSection />
        <VisitStudio />
      </main>
      <Footer />
    </>
  );
}
