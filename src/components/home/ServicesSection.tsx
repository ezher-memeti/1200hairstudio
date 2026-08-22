import Services from "@/components/home/Services";
import { getActiveServices } from "@/lib/public/services";

export default async function ServicesSection() {
  const services = await getActiveServices();

  return <Services services={services} />;
}
