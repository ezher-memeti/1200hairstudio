import SiteSettingsNav from "@/components/admin/SiteSettingsNav";

export default function SiteSettingsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="space-y-8 lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-10 lg:space-y-0">
      <SiteSettingsNav />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
