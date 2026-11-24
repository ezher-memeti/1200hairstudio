import SectionTwoClient from "@/components/home/SectionTwoClient";
import type { HomepageContent } from "@/lib/homepage-content-defaults";

export default function SectionTwo({ content }: { content: HomepageContent }) {
  return <SectionTwoClient content={content} />;
}
