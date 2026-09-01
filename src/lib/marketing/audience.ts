import { canReceiveMarketingEmail } from "@/lib/customers/marketing-consent";
import { getCustomerInsights } from "@/lib/customers/status";
import type { AdminCustomerDirectoryEntry } from "@/lib/customers/types";
import type { MarketingAudienceFilters, MarketingRecipientPreview } from "./types";

export function getEligibleMarketingRecipients(
  customers: AdminCustomerDirectoryEntry[],
  filters: MarketingAudienceFilters,
  now = new Date(),
) {
  return customers.flatMap<MarketingRecipientPreview>((customer) => {
    if (customer.id.startsWith("legacy-guest:") || !canReceiveMarketingEmail(customer)) return [];
    const insights = getCustomerInsights(customer, now);
    if (filters.statuses.length && !filters.statuses.includes(insights.status)) return [];
    if (filters.favoriteService && insights.favoriteService !== filters.favoriteService) return [];
    if (filters.appointment === "upcoming" && !insights.nextConfirmedAppointment) return [];
    if (filters.appointment === "none" && insights.nextConfirmedAppointment) return [];
    if (filters.lastVisit !== "all") {
      const days = insights.daysSinceLastCompleted;
      if (days === null) return [];
      if (filters.lastVisit === "120_plus" ? days < 120 : days > Number(filters.lastVisit)) return [];
    }
    return [{ id: customer.id, name: customer.full_name, email: customer.email, status: insights.status, favoriteService: insights.favoriteService }];
  });
}
