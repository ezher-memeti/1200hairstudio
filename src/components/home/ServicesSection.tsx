import Services from "@/components/home/Services";
import { getActiveServices } from "@/lib/public/services";
import type { HomepageContent } from "@/lib/homepage-content-defaults";

export default async function ServicesSection({ content }: { content: HomepageContent }) {
  const services = await getActiveServices();

  return <Services services={services} content={content} />;
}
