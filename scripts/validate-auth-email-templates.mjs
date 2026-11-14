import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const templates = [
  { type: "confirmation", file: "confirm-signup.html", subject: "Confirm your email | 1200 Hairstudio", variables: ["ConfirmationURL", "SiteURL"], redirect: "/" },
  { type: "recovery", file: "reset-password.html", subject: "Reset your password | 1200 Hairstudio", variables: ["ConfirmationURL", "SiteURL"], redirect: "/reset-password" },
];
const args = process.argv.slice(2);
assert(args.length === 0 || (args.length === 2 && args[0] === "--preview-dir"), "Usage: node scripts/validate-auth-email-templates.mjs [--preview-dir DIRECTORY]");
const previewDir = args.length ? resolve(args[1]) : null;
if (previewDir) {
  const repositoryPrefix = root.endsWith("/") ? root : `${root}/`;
  assert(previewDir !== resolve(root) && !previewDir.startsWith(repositoryPrefix), "Keep generated previews outside the repository.");
  await mkdir(previewDir, { recursive: true });
}
const config = await readFile(resolve(root, "supabase/config.toml"), "utf8");
const htmlFiles = (await readdir(resolve(root, "supabase/templates/auth"))).filter((file) => file.endsWith(".html"));
assert.deepEqual(htmlFiles.sort(), templates.map(({ file }) => file).sort(), "Only signup confirmation and password recovery HTML templates are supported.");
const configuredTypes = [...config.matchAll(/^\[auth\.email\.template\.([^\]]+)\]/gm)].map((match) => match[1]);
assert.deepEqual(configuredTypes.sort(), templates.map(({ type }) => type).sort(), "Only signup confirmation and password recovery template configuration is supported.");
const escapeHtml = (value) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

for (const template of templates) {
  const relativePath = `supabase/templates/auth/${template.file}`;
  const html = await readFile(resolve(root, relativePath), "utf8");
  const tokens = [...html.matchAll(/{{\s*\.([A-Za-z]+)\s*}}/g)];
  assert.deepEqual([...new Set(tokens.map((match) => match[1]))].sort(), [...template.variables].sort(), `${template.file}: missing or unexpected Supabase variables`);
  assert(!html.replace(/{{\s*\.[A-Za-z]+\s*}}/g, "").includes("{{"), `${template.file}: unsupported template expression`);
  assert.equal((html.match(/href="{{ \.ConfirmationURL }}"/g) ?? []).length, 1, `${template.file}: expected exactly one CTA using ConfirmationURL`);
  assert.equal((html.match(/{{ \.ConfirmationURL }}/g) ?? []).length, 1, `${template.file}: ConfirmationURL must appear only in the CTA href`);
  assert(!/Button not working|Copy the (?:secure|verification) link|word-break:break-all/i.test(html), `${template.file}: fallback URL sections must not be restored`);
  assert(html.includes("This private link expires and can be used only once."), `${template.file}: missing security notice`);
  assert.equal((html.match(/<a\b/g) ?? []).length, 2, `${template.file}: expected only the CTA and business footer links`);
  assert(/^<!doctype html>/i.test(html), `${template.file}: missing doctype`);
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1, `${template.file}: expected one main heading`);
  assert(!/<(?:script|form|iframe|input|img)\b|\son[a-z]+\s*=|javascript:|@import|display\s*:\s*(?:grid|flex)/i.test(html), `${template.file}: unexpected active content or unsupported layout`);
  assert(!/\bclassName=|\bstyle=\{|\bimport\s.+from\s/.test(html), `${template.file}: Dashboard HTML must not contain JSX`);
  assert([...html.matchAll(/<table\b[^>]*>/g)].every(([tag]) => tag.includes('role="presentation"')), `${template.file}: layout tables need presentation roles`);
  assert(html.includes('name="viewport"') && html.includes("max-width:600px"), `${template.file}: missing fluid layout`);
  assert(html.includes("Schulstrasse 2") && html.includes("8599 Salmsach, Switzerland"), `${template.file}: missing business footer`);
  const sectionName = `[auth.email.template.${template.type}]`;
  const section = config.split(sectionName)[1]?.split(/\n\[/)[0];
  assert(section?.includes(`subject = "${template.subject}"`) && section.includes(`content_path = "./${relativePath}"`), `${template.file}: local Supabase configuration is inconsistent`);

  if (previewDir) {
    const confirmationUrl = new URL("https://auth.example.invalid/auth/v1/verify");
    confirmationUrl.searchParams.set("token", "preview-only-not-a-real-token-".repeat(8));
    confirmationUrl.searchParams.set("type", template.type === "confirmation" ? "signup" : template.type);
    confirmationUrl.searchParams.set("redirect_to", `https://1200.example${template.redirect}`);
    const values = { ConfirmationURL: confirmationUrl.toString(), SiteURL: "https://1200.example" };
    const preview = html.replace(/{{\s*\.([A-Za-z]+)\s*}}/g, (_, variable) => escapeHtml(values[variable]));
    await writeFile(resolve(previewDir, template.file), preview);
  }
  console.log(`PASS ${template.type}: HTML safety, link variables, branding, and local configuration`);
}
console.log(`Validated ${templates.length} Supabase Auth templates. No email was sent and no hosted settings were changed.`);
if (previewDir) console.log(`Synthetic preview HTML: ${previewDir}`);
