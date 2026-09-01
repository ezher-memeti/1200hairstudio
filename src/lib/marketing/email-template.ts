import "server-only";

import type { MarketingEmailContent } from "./types";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildMarketingCampaignEmail(content: MarketingEmailContent) {
  const paragraphs = content.content
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const safeUrl = /^https?:\/\//i.test(content.ctaUrl) ? content.ctaUrl : "";
  const body = paragraphs
    .map((paragraph) => `<p style="margin:0 0 18px;color:#b7b4ae;font-size:15px;line-height:1.75;">${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const cta = safeUrl && content.ctaText
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:30px"><tr><td style="background:#d8b174"><a href="${escapeHtml(safeUrl)}" style="display:inline-block;padding:15px 24px;color:#111;text-decoration:none;font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase">${escapeHtml(content.ctaText)}</a></td></tr></table>`
    : "";

  return {
    html: `<!doctype html><html><body style="margin:0;background:#0b0b0b"><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(content.preheader)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#0b0b0b"><tr><td align="center" style="padding:28px 14px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:620px;background:#121212;border:1px solid #292929"><tr><td style="padding:38px 38px 18px"><div style="color:#f5f2ec;font-size:30px;font-weight:700;letter-spacing:.05em">1200</div><div style="margin-top:4px;color:#8d8982;font-size:10px;letter-spacing:.3em">HAIRSTUDIO</div></td></tr><tr><td style="padding:34px 38px 42px;border-top:1px solid #292929"><div style="margin-bottom:14px;color:#d8b174;font-size:10px;letter-spacing:.22em;text-transform:uppercase">1200 Hairstudio</div><h1 style="margin:0 0 24px;color:#f5f2ec;font-size:34px;line-height:1.18;font-weight:600">${escapeHtml(content.headline)}</h1>${body}${cta}</td></tr><tr><td style="padding:24px 38px;border-top:1px solid #292929;color:#77736d;font-size:11px;line-height:1.6">1200 Hairstudio · Schulstrasse 2 · 8599 Salmsach, Switzerland</td></tr></table></td></tr></table></body></html>`,
    text: [content.headline, "", content.content, safeUrl && content.ctaText ? `\n${content.ctaText}: ${safeUrl}` : "", "", "1200 Hairstudio", "Schulstrasse 2, 8599 Salmsach, Switzerland"].filter(Boolean).join("\n"),
  };
}

