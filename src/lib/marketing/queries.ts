import "server-only";

import { requireAdminUser } from "@/lib/auth/customer";
import { getAdminCustomerDirectory } from "@/lib/customers/queries";
import { getEligibleMarketingRecipients } from "./audience";
import { DEFAULT_MARKETING_FILTERS, type MarketingCampaign, type MarketingCampaignDetail, type MarketingTemplate } from "./types";

export async function getMarketingDashboardData() {
  const { supabase } = await requireAdminUser();
  const [templatesResult, campaignsResult, recipientsResult, customers] = await Promise.all([
    supabase.from("marketing_templates").select("id,name,description,default_subject,default_preheader,default_headline,default_content,default_cta_text,default_cta_url,is_active").order("created_at"),
    supabase.from("marketing_campaigns").select("id,name,template_id,status,subject,preheader,headline,content,cta_text,cta_url,audience_filters,recipient_count,sent_at,created_at,updated_at").order("created_at", { ascending: false }),
    supabase.from("marketing_campaign_recipients").select("status"),
    getAdminCustomerDirectory(),
  ]);

  if (templatesResult.error) throw new Error(`Unable to load marketing templates: ${templatesResult.error.message}`);
  if (campaignsResult.error) throw new Error(`Unable to load campaigns: ${campaignsResult.error.message}`);
  if (recipientsResult.error) throw new Error(`Unable to load campaign totals: ${recipientsResult.error.message}`);

  const campaigns = (campaignsResult.data ?? []) as MarketingCampaign[];
  const recipientStatuses = recipientsResult.data ?? [];
  return {
    templates: (templatesResult.data ?? []) as MarketingTemplate[],
    campaigns,
    subscribers: getEligibleMarketingRecipients(customers, DEFAULT_MARKETING_FILTERS).length,
    campaignsSent: campaigns.filter((campaign) => campaign.status === "sent").length,
    emailsSent: recipientStatuses.filter((recipient) => recipient.status === "sent").length,
  };
}

export async function getMarketingCampaignDetail(campaignId: string): Promise<MarketingCampaignDetail | null> {
  const { supabase } = await requireAdminUser();
  const [{ data: campaign, error }, { data: recipientRows, error: recipientsError }, customers] = await Promise.all([
    supabase.from("marketing_campaigns").select("id,name,template_id,status,subject,preheader,headline,content,cta_text,cta_url,audience_filters,recipient_count,sent_at,created_at,updated_at,marketing_templates(name)").eq("id", campaignId).maybeSingle(),
    supabase.from("marketing_campaign_recipients").select("id,customer_id,email_snapshot,status,sent_at,failure_reason").eq("campaign_id", campaignId).order("created_at"),
    getAdminCustomerDirectory(),
  ]);
  if (error) throw new Error(`Unable to load campaign: ${error.message}`);
  if (recipientsError) throw new Error(`Unable to load campaign recipients: ${recipientsError.message}`);
  if (!campaign) return null;
  const customersById = new Map(customers.map((customer) => [customer.id, customer]));
  const recipients = (recipientRows ?? []).map((recipient) => {
    const customer = customersById.get(recipient.customer_id);
    return { id: recipient.id, name: customer?.full_name ?? "Customer", email: recipient.email_snapshot, status: recipient.status, sent_at: recipient.sent_at, failure_reason: recipient.failure_reason };
  });
  const templateRelation = campaign.marketing_templates as unknown as { name: string } | null;
  return {
    ...(campaign as unknown as MarketingCampaign),
    template_name: templateRelation?.name ?? "Custom Campaign",
    sent_count: recipients.filter((recipient) => recipient.status === "sent").length,
    failed_count: recipients.filter((recipient) => recipient.status === "failed").length,
    skipped_count: recipients.filter((recipient) => recipient.status === "skipped").length,
    recipients,
  };
}
