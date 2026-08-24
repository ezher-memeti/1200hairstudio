import SelectedWorkClient from "@/components/home/SelectedWorkClient";
import { getActiveSelectedWork } from "@/lib/public/selected-work";
import type { WorkItem } from "@/components/home/CircularGallery";

export default async function SelectedWork() {
  const selectedWork = await getActiveSelectedWork();

  const works: WorkItem[] = selectedWork.map((item, index) => ({
    id: item.id,
    title: item.title?.trim() || `Work ${String(index + 1).padStart(2, "0")}`,
    subtitle: item.description?.trim() || "Selected Work",
    meta: undefined,
    image: item.image_url.trim(),
  }));

  const hasWorks = works.length > 0;

  return (
    <section id="work" className="relative overflow-hidden bg-background">
      <div
        className="pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat opacity-55"
        style={{
          backgroundImage: "url('/images/background-work.PNG')",
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(8,8,8,0.78)_0%,rgba(8,8,8,0.68)_42%,rgba(8,8,8,0.82)_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(8,8,8,0.22)_0%,rgba(8,8,8,0.5)_58%,rgba(8,8,8,0.74)_100%)]" />

      <div className="page-container relative z-10 py-8 sm:py-10 lg:py-12">
        <div className="space-y-4">
          <p className="font-primary text-xs uppercase tracking-[0.34em] text-foreground-secondary">
            04 / Selected Work
          </p>
          <h2 className="font-display max-w-lg text-[clamp(2.2rem,6vw,4.5rem)] font-semibold uppercase leading-[0.95] tracking-[-0.04em] text-foreground">
            Selected
            <br />
            Work.
          </h2>
          <p className="font-primary max-w-md text-sm leading-7 text-foreground-secondary sm:text-base">
            A selection of cuts from the chair.
          </p>
        </div>

        {hasWorks ? (
          <SelectedWorkClient works={works} />
        ) : (
          <div className="pt-8 sm:pt-10">
            <p className="font-primary text-sm leading-7 text-foreground-secondary sm:text-base">
              Selected work is unavailable right now.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
