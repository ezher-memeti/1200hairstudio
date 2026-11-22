import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import BookingSection from "@/components/home/BookingSection";
import { getHomepageContent } from "@/lib/homepage-content";
export default async function BookPage() {
  const content = await getHomepageContent();
  return <><Header /><main><BookingSection content={content} /></main><Footer content={content} /></>;
}
