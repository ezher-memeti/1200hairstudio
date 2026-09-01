import type { CustomerStatus } from "@/lib/customers/status";

export type MarketingTemplate = {
  id: string;
  name: string;
  description: string | null;
  default_subject: string;
  default_preheader: string | null;
  default_headline: string;
  default_content: string;
  default_cta_text: string | null;
  default_cta_url: string | null;
  is_active: boolean;
};

export type MarketingTemplateInput = {
  name: string;
  description: string;
  subject: string;
  preheader: string;
  headline: string;
  content: string;
  ctaText: string;
  ctaUrl: string;
};

export type CampaignStatus = "draft" | "sending" | "sent" | "failed";

export type MarketingCampaign = {
  id: string;
  name: string;
  template_id: string | null;
  status: CampaignStatus;
  subject: string;
  preheader: string | null;
  headline: string;
  content: string;
  cta_text: string | null;
  cta_url: string | null;
  audience_filters: MarketingAudienceFilters | null;
  recipient_count: number;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MarketingAudienceFilters = {
  statuses: CustomerStatus[];
  favoriteService: string | null;
  appointment: "all" | "upcoming" | "none";
  lastVisit: "all" | "30" | "60" | "90" | "120_plus";
};

export const DEFAULT_MARKETING_FILTERS: MarketingAudienceFilters = {
  statuses: [],
  favoriteService: null,
  appointment: "all",
  lastVisit: "all",
};

export type MarketingEmailContent = {
  campaignName: string;
  templateId: string | null;
  subject: string;
  preheader: string;
  headline: string;
  content: string;
  ctaText: string;
  ctaUrl: string;
};

export type MarketingRecipientPreview = {
  id: string;
  name: string;
  email: string;
  status: CustomerStatus;
  favoriteService: string | null;
};

export type MarketingCampaignDetail = MarketingCampaign & {
  template_name: string;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
  recipients: Array<{
    id: string;
    name: string;
    email: string;
    status: string;
    sent_at: string | null;
    failure_reason: string | null;
  }>;
};
