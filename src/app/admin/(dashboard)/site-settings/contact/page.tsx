import ContactSettingsManager from "@/components/admin/ContactSettingsManager";
import { getAdminContactSectionSettings } from "@/lib/contact-section/settings";
import { DEFAULT_CONTACT_SECTION_SETTINGS } from "@/lib/contact-section/types";

export const dynamic = "force-dynamic";

export default async function AdminContactSettingsPage() {
  const result = await getAdminContactSectionSettings()
    .then((value) => ({ value, error: "" }))
    .catch((error) => { console.error("Unable to load contact settings", error); return { value: DEFAULT_CONTACT_SECTION_SETTINGS, error: "Contact settings could not be loaded. Defaults are shown and have not been saved." }; });
  return <ContactSettingsManager initialSettings={result.value} initialError={result.error}/>;
}
