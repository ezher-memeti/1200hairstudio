import UnderConstruction from "@/components/site-mode/UnderConstruction";
import { siteModeMetadata } from "@/components/site-mode/metadata";
export const dynamic = "force-dynamic";
export const generateMetadata = () => siteModeMetadata("maintenance");
export default UnderConstruction;
