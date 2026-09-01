"use server";

import { revalidatePath } from "next/cache";
import { requireAdminUser } from "@/lib/auth/customer";
import { canReceiveMarketingEmail, isValidEmail } from "@/lib/customers/marketing-consent";
import { getAdminCustomerDirectory } from "@/lib/customers/queries";
import type { CustomerRecord } from "@/lib/customers/types";
import { sendGmailMessage } from "@/lib/email/gmail";
import { sendMarketingEmail } from "@/lib/email/marketing";
import { getEligibleMarketingRecipients } from "@/lib/marketing/audience";
import { buildMarketingCampaignEmail } from "@/lib/marketing/email-template";
import { getMarketingCampaignDetail } from "@/lib/marketing/queries";
import type { MarketingAudienceFilters, MarketingEmailContent, MarketingTemplateInput } from "@/lib/marketing/types";

type ActionResult = { success: true; message: string; campaignId?: string } | { success: false; message: string };

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function validateContent(input: MarketingEmailContent): MarketingEmailContent {
  const content = {
    campaignName: clean(input.campaignName, 120), templateId: clean(input.templateId, 80) || null,
    subject: clean(input.subject, 160), preheader: clean(input.preheader, 200), headline: clean(input.headline, 180),
    content: clean(input.content, 5000), ctaText: clean(input.ctaText, 80), ctaUrl: clean(input.ctaUrl, 500),
  };
  if (!content.campaignName || !content.subject || !content.headline || !content.content) throw new Error("Campaign name, subject, headline and content are required.");
  if (content.ctaUrl && !/^https?:\/\//i.test(content.ctaUrl)) throw new Error("CTA URL must begin with http:// or https://.");
  return content;
}

function validateTemplate(input: MarketingTemplateInput) {
  const template = {
    name: clean(input.name, 120),
    description: clean(input.description, 500),
    subject: clean(input.subject, 160),
    preheader: clean(input.preheader, 200),
    headline: clean(input.headline, 180),
    content: clean(input.content, 5000),
    ctaText: clean(input.ctaText, 80),
    ctaUrl: clean(input.ctaUrl, 500),
  };
  if (!template.name || !template.subject || !template.headline || !template.content) throw new Error("Template name, subject, headline and content are required.");
  if (template.ctaUrl && !/^https?:\/\//i.test(template.ctaUrl)) throw new Error("CTA URL must begin with http:// or https://.");
  return template;
}

export async function saveMarketingTemplate(input: MarketingTemplateInput, templateId?: string): Promise<ActionResult> {
  try {
    const { supabase } = await requireAdminUser();
    const template = validateTemplate(input);
    const payload = {
      name: template.name,
      description: template.description || null,
      default_subject: template.subject,
      default_preheader: template.preheader || null,
      default_headline: template.headline,
      default_content: template.content,
      default_cta_text: template.ctaText || null,
      default_cta_url: template.ctaUrl || null,
      is_active: true,
    };

    if (templateId !== undefined) {
      const normalizedTemplateId = clean(templateId, 80);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizedTemplateId)) {
        return { success: false, message: "The template identifier is invalid." };
      }

      const { data: existingTemplate, error: lookupError } = await supabase
        .from("marketing_templates")
        .select("id")
        .eq("id", normalizedTemplateId)
        .maybeSingle();
      if (lookupError) {
        console.error("Marketing template update lookup failed", { operation: "update", templateId: normalizedTemplateId, error: lookupError });
        return { success: false, message: "Template was not found or could not be updated." };
      }
      if (!existingTemplate) return { success: false, message: "Template was not found or could not be updated." };

      const { data: updatedTemplate, error: updateError } = await supabase
        .from("marketing_templates")
        .update(payload)
        .eq("id", normalizedTemplateId)
        .select()
        .single();
      if (updateError || !updatedTemplate) {
        console.error("Marketing template update failed", { operation: "update", templateId: normalizedTemplateId, error: updateError });
        return { success: false, message: "Template was not found or could not be updated." };
      }

      revalidatePath("/admin/marketing");
      return { success: true, message: "Template updated." };
    }

    const { data: createdTemplate, error: insertError } = await supabase
      .from("marketing_templates")
      .insert(payload)
      .select()
      .single();
    if (insertError || !createdTemplate) {
      console.error("Marketing template creation failed", { operation: "create", error: insertError });
      return { success: false, message: "Template could not be created." };
    }

    revalidatePath("/admin/marketing");
    return { success: true, message: "Template created." };
  } catch (error) {
    console.error("Marketing template validation or authorization failed", error);
    return { success: false, message: error instanceof Error ? error.message : "Unable to save template." };
  }
}

export async function deleteMarketingTemplate(templateId: string): Promise<ActionResult> {
  try {
    const { supabase } = await requireAdminUser();
    const id = clean(templateId, 80);
    if (!id) return { success: false, message: "Template is required." };
    const { error } = await supabase.from("marketing_templates").delete().eq("id", id);
    if (error) throw error;
    revalidatePath("/admin/marketing");
    return { success: true, message: "Template deleted. Existing campaigns were not changed." };
  } catch (error) {
    console.error("Unable to delete marketing template", error);
    return { success: false, message: "Unable to delete this template. It may still be referenced by an existing campaign." };
  }
}

function campaignPayload(content: MarketingEmailContent, filters: MarketingAudienceFilters, createdBy: string) {
  return { name: content.campaignName, template_id: content.templateId, subject: content.subject, preheader: content.preheader || null, headline: content.headline, content: content.content, cta_text: content.ctaText || null, cta_url: content.ctaUrl || null, audience_filters: filters, created_by: createdBy };
}

export async function previewMarketingAudience(filters: MarketingAudienceFilters) {
  await requireAdminUser();
  const customers = await getAdminCustomerDirectory();
  return getEligibleMarketingRecipients(customers, filters);
}

export async function saveMarketingDraft(input: MarketingEmailContent, filters: MarketingAudienceFilters, campaignId?: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireAdminUser();
    const content = validateContent(input);
    const payload = { ...campaignPayload(content, filters, user.id), status: "draft", recipient_count: 0 };
    if (campaignId) {
      const { data: existingDraft, error: lookupError } = await supabase.from("marketing_campaigns").select("id,status").eq("id", campaignId).maybeSingle();
      if (lookupError) throw lookupError;
      if (!existingDraft || existingDraft.status !== "draft") return { success: false, message: "This draft was not found or can no longer be edited." };
    }
    const query = campaignId
      ? supabase.from("marketing_campaigns").update(payload).eq("id", campaignId).eq("status", "draft").select("id").maybeSingle()
      : supabase.from("marketing_campaigns").insert(payload).select("id").single();
    const { data, error } = await query;
    if (error) throw error;
    if (!data) return { success: false, message: "This draft was not found or could not be updated." };
    revalidatePath("/admin/marketing");
    return { success: true, message: "Campaign draft saved.", campaignId: data.id };
  } catch (error) { return { success: false, message: error instanceof Error ? error.message : "Unable to save campaign." }; }
}

export async function deleteMarketingDraft(campaignId: string): Promise<ActionResult> {
  try {
    const { supabase } = await requireAdminUser();
    const id = clean(campaignId, 80);
    if (!id) return { success: false, message: "Campaign draft is required." };
    const { data, error } = await supabase.from("marketing_campaigns").delete().eq("id", id).eq("status", "draft").select("id").maybeSingle();
    if (error) throw error;
    if (!data) return { success: false, message: "This draft was not found or can no longer be deleted." };
    revalidatePath("/admin/marketing");
    return { success: true, message: "Campaign draft deleted." };
  } catch (error) {
    console.error("Unable to delete marketing draft", error);
    return { success: false, message: "The campaign draft could not be deleted." };
  }
}

export async function sendMarketingTest(input: MarketingEmailContent): Promise<ActionResult> {
  try {
    const { user } = await requireAdminUser();
    const content = validateContent(input);
    if (!user.email) return { success: false, message: "Your admin account has no email address." };
    const email = buildMarketingCampaignEmail(content);
    await sendGmailMessage({ to: user.email, subject: `[TEST] ${content.subject}`, html: email.html, text: email.text });
    return { success: true, message: `Test email sent to ${user.email}.` };
  } catch (error) { console.error("Marketing test email failed", error); return { success: false, message: "The test email could not be sent." }; }
}

export async function sendMarketingCampaign(input: MarketingEmailContent, filters: MarketingAudienceFilters, campaignId?: string): Promise<ActionResult> {
  let activeCampaignId: string | null = null;
  try {
    const { supabase, user } = await requireAdminUser();
    const content = validateContent(input);
    if (campaignId) {
      const { data: existingDraft, error: draftError } = await supabase.from("marketing_campaigns").select("id,status").eq("id", campaignId).maybeSingle();
      if (draftError) throw draftError;
      if (!existingDraft || existingDraft.status !== "draft") return { success: false, message: "This campaign was already sent or can no longer be processed." };
    }
    const customers = await getAdminCustomerDirectory();
    const eligible = getEligibleMarketingRecipients(customers, filters);
    if (!eligible.length) return { success: false, message: "No eligible marketing subscribers match this audience." };
    const payload = { ...campaignPayload(content, filters, user.id), status: "sending", recipient_count: eligible.length };
    const campaignQuery = campaignId ? supabase.from("marketing_campaigns").update(payload).eq("id", campaignId).eq("status", "draft").select("id").maybeSingle() : supabase.from("marketing_campaigns").insert(payload).select("id").single();
    const { data: campaign, error: campaignError } = await campaignQuery;
    if (campaignError || !campaign) throw campaignError ?? new Error("Campaign draft was not found or could not be prepared for sending.");
    activeCampaignId = campaign.id;
    const email = buildMarketingCampaignEmail(content);
    let sent = 0, failed = 0, skipped = 0, trackedRecipients = 0;
    for (const recipient of eligible) {
      const { data: freshCustomer, error: customerError } = await supabase.from("customers").select("*").eq("id", recipient.id).maybeSingle();
      if (customerError || !freshCustomer || !isValidEmail(freshCustomer.email)) {
        skipped += 1;
        console.error("Marketing recipient could not be loaded with a valid email", { campaignId: campaign.id, customerId: recipient.id, error: customerError });
        continue;
      }

      const emailSnapshot = freshCustomer.email.trim().toLowerCase();
      const campaignCustomer = {
        ...freshCustomer,
        email: emailSnapshot,
      } as CustomerRecord;
      let status = "pending";
      const { data: row, error: rowError } = await supabase.from("marketing_campaign_recipients").insert({
        campaign_id: campaign.id,
        customer_id: campaignCustomer.id,
        email_snapshot: emailSnapshot,
        status,
      }).select("id").single();
      if (rowError || !row) { failed += 1; console.error("Unable to create campaign recipient", rowError); continue; }
      trackedRecipients += 1;
      if (!canReceiveMarketingEmail(campaignCustomer)) {
        const { error: skippedUpdateError } = await supabase.from("marketing_campaign_recipients").update({ status: "skipped", sent_at: null, failure_reason: null }).eq("id", row.id);
        if (skippedUpdateError) console.error("Unable to mark marketing recipient skipped", { recipientId: row.id, error: skippedUpdateError });
        skipped += 1;
        continue;
      }
      try {
        const result = await sendMarketingEmail({ customer: campaignCustomer, subject: content.subject, html: email.html, text: email.text });
        status = result.sent ? "sent" : "skipped";
        result.sent ? sent += 1 : skipped += 1;
      } catch (emailError) { status = "failed"; failed += 1; console.error("Marketing recipient email failed", { campaignId: campaign.id, customerId: recipient.id, error: emailError }); }
      const { error: recipientUpdateError } = await supabase.from("marketing_campaign_recipients").update({
        status,
        sent_at: status === "sent" ? new Date().toISOString() : null,
        failure_reason: status === "failed" ? "Email provider could not deliver this message." : null,
      }).eq("id", row.id);
      if (recipientUpdateError) console.error("Unable to persist marketing delivery status", { recipientId: row.id, status, error: recipientUpdateError });
    }
    if (trackedRecipients === 0) throw new Error("No campaign recipients could be tracked or processed.");
    const { error: completionError } = await supabase.from("marketing_campaigns").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", campaign.id);
    if (completionError) throw completionError;
    revalidatePath("/admin/marketing");
    return { success: true, message: `Campaign complete: ${sent} sent, ${failed} failed, ${skipped} skipped.`, campaignId: campaign.id };
  } catch (error) {
    console.error("Marketing campaign failed", error);
    if (activeCampaignId) {
      try {
        const { supabase } = await requireAdminUser();
        await supabase.from("marketing_campaigns").update({ status: "failed" }).eq("id", activeCampaignId);
      } catch (statusError) {
        console.error("Unable to mark marketing campaign failed", statusError);
      }
    }
    return { success: false, message: "The campaign could not be completed." };
  }
}

export async function loadMarketingCampaign(campaignId: string) { return getMarketingCampaignDetail(campaignId); }
