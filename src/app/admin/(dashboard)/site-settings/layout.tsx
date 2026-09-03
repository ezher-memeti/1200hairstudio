import SiteSettingsNav from "@/components/admin/SiteSettingsNav";

export default function SiteSettingsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <section className="min-w-0">
      <SiteSettingsNav />
      <div className="min-w-0 pt-7">{children}</div>
    </section>
  );
}
