# Shared business identity and legal pages

## Source of truth

`admin_settings` → row `settings_key = 'business'` → `settings_value` JSONB is authoritative. Existing fields are reused; `owner_name` and optional `uid` are additional JSON keys, not schema columns. The confirmed fallback identity appears once in `src/lib/business/identity.ts`, and is used only for missing/empty/placeholder identity values. Valid database edits override it.

Business identity is editable in **Admin → Site Settings → Business**, using the same existing settings form/storage also exposed at Admin → Settings → Business. It includes owner and optional UID. Saving preserves unrelated business JSON, requires the existing admin authorization, guards against concurrent stale writes, and invalidates the root layout. Runtime reads use request-scoped caching, not a persistent cache requiring deployment.

English/German imprint and privacy responsible-party sections render `BusinessDetails` from the database. Country is Switzerland/Schweiz. Email and phone use validated mailto/tel links. UID is omitted when empty/placeholder; no UID/VAT/commercial-register number was invented. Existing substantive legal clauses were retained; only identity/contact references changed.

The existing source contains **no Terms/AGB page or legal terms body**. No new legal conditions or Terms page were invented. If an external/untracked Terms document exists, its location/content needs to be supplied to integrate the same identity.

## Consistency

- Imprint/Impressum and privacy responsible-party contact use the shared server component.
- Footer and Visit Studio address use business settings rather than homepage editorial address fields.
- Public Contact settings retain their existing feature flags, text, social/map/review actions, but public phone/address values come from business settings. Existing legacy contact/homepage identity fields are retained for database compatibility and are not authoritative; edit business identity through the Business tab.
- Booking confirmation/update/cancellation/admin emails already used runtime business settings; their localized address/contact block now includes the shared email/phone and Switzerland/Schweiz. Existing Gmail sender authorization, OAuth, delivery, notification flags and SMTP were not changed.
- Receipt PDF issuer identity reads business settings, including owner, contacts and optional UID. Only issuer layout changed; receipt amounts, tax, payment, numbering and records are untouched. The existing branded logo treatment remains.
- Receipt email identity uses the same settings with HTML escaping. Recurring/reminder identity already uses runtime business settings.
- HairSalon (LocalBusiness subtype) JSON-LD uses the same business name/address/phone/email. Editorial address fields no longer override it; no coordinates/UID/ratings were fabricated.
- Supabase-hosted Auth templates are separate, unchanged, and currently contain the confirmed street/postcode. Their static footer is not a dynamic database query; later address changes require a separately authorized hosted-template update.

## Hosted update and SQL

The configured hosted business row was read, then updated using an equality guard on its previous JSON value and verified afterward. Only the supplied confirmed business name, owner, street/postcode/city/country/email/phone were set. Existing region/website/timezone/currency and all other business keys were preserved. The row had no owner/UID configured before this change; no UID was added. No other settings rows, customer/appointment/payment data, credentials or RLS policies were changed.

`supabase/migrations/202611260001_business_identity.sql` contains the corresponding **non-destructive data seed**. No DDL/new columns are required. It merges only the confirmed identity into the business row, removes conflicting aliases for those managed fields, preserves unrelated keys and a real UID, and clears only a placeholder UID. It does not reset the database.

The equivalent scoped hosted data update has already been performed. The migration-history version was **not** automatically marked applied. Review/reconcile that data migration through the normal release workflow; do not blindly rerun this initial seed after an administrator deliberately changes identity later. No additional hosted settings change is required for the confirmed information. The application code still needs a normal authorized deployment; no deployment was performed by this task.

## Changed files

- Shared business defaults/helpers: `src/lib/business/identity.ts`.
- Persistence/admin: `src/lib/admin/settings.ts`, settings actions, `AdminSettingsView.tsx`, `SiteSettingsNav.tsx`, new site-settings business page.
- Public: imprint/privacy pages, `components/legal/BusinessDetails.tsx`, `Footer.tsx`, `VisitStudio.tsx`, contact settings loader, homepage JSON-LD data wiring and `lib/seo/business.ts`.
- Email/PDF: Gmail branding, receipt email and receipt PDF generator.
- EN/DE messages, identity/seed/browser tests, affected SEO/i18n/PDF test fixtures and the seed SQL.

## Verification scope

- `node scripts/test-business-identity.cjs`: confirmed fallbacks, configured overrides, optional UID, exact links, Swiss localization, authoritative SEO, preservation of unknown business keys and stale-write rejection.
- `PGLITE_MODULE=... node scripts/test-business-identity-db.cjs`: actual seed in isolated PostgreSQL, replay, real UID/unrelated business and booking settings preserved; no hosted SQL execution for tests.
- `LEGAL_BUILD_DIR=... PLAYWRIGHT_MODULE_PATH=... node scripts/test-business-pages-browser.cjs`: actual production-build pages with a loopback-only synthetic backend; both languages, 320/390/1440 widths, hidden/configured UID, mailto/tel, footer/contact/visit/SEO identity, and edits appearing without rebuilding.
- Existing receipt generation test creates a synthetic one-page PDF; rendered and visually inspected for header spacing, contacts and financial layout. No fiscal receipt/database record was created or email sent.
- TypeScript, lint, translation validator, SEO, i18n, admin-content and sanitized-logging regressions are run independently.

## Reported Next.js issues

No screenshot was attached/available with this request. The exact two issue messages were requested; without them, this task cannot identify or claim to fix those specific issues. A read-only attempt to inspect the existing development legal pages timed out. A separate production-build/browser audit is used to check the implemented pages, not presented as reproduction of the missing screenshot.

An actual build blocker was identified independently: ENOSPC from accumulated disposable audit build caches. Only regenerable cache files in prior isolated `/tmp` build copies were removed; the working project, user dev server and database were not reset. The standard build is rerun after that environment cleanup.

## Final verification results

- TypeScript passed; ESLint passed with only the three existing next/image warnings.
- Standard production build, including lint, passed after clearing disposable audit caches. Build/test credentials and backend were synthetic, not production.
- Actual production-build browser audit passed in EN/DE at 320, 390 and 1440px. Verified owner/address/country, exact mailto/tel links, no placeholder/empty UID section, configured UID display, footer/contact/Visit/JSON-LD consistency, and live backend changes appearing without rebuilding. Mobile/desktop imprint screenshots were inspected; no clipping or horizontal overflow found.
- Browser audit reported no application runtime errors. This is not a claim to have reproduced or fixed the two unavailable screenshot messages.
- Identity normalization/admin save, isolated PostgreSQL seed/replay, SEO, i18n, admin-content, translation validator, receipt PDF and sanitized logging tests passed. The generated synthetic receipt was rendered and visually inspected, with no issuer/amount overlap.
- No legal-information placeholders remain in runtime source/messages/templates. Intentional negative test fixtures and migration cleanup patterns are not production values.
- Hosted business data update was verified separately; production page code has not been deployed. No live emails, test bookings, payments, receipt records or customer data were created/modified.
