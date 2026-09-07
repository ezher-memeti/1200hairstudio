import LoyaltySettingsManager from "@/components/admin/LoyaltySettingsManager";
import { DEFAULT_LOYALTY_SETTINGS, getLoyaltySettings } from "@/lib/loyalty/settings";

export default async function AdminLoyaltySettingsPage() {
  const result = await getLoyaltySettings()
    .then((value) => ({ value, error: "" }))
    .catch(() => ({ value: DEFAULT_LOYALTY_SETTINGS, error: "Loyalty settings could not be loaded. Defaults are shown and have not been saved." }));

  return <LoyaltySettingsManager initialSettings={result.value} initialError={result.error} />;
}
