# Internationalization completeness audit — 2026-11-22

## Findings and corrections

The prior implementation had matching dictionaries but incomplete display coverage:
source-text lookups were case-sensitive, many constant/prop/enum labels were not in
the dictionary, some render paths skipped lookup entirely, and shared date helpers
still formatted English dates. English suffix concatenation produced invalid German
such as “0 Termins”. Chart subtitles/legends and report exports had independent
English or bilingual captions. These were display problems, not database enum or
calculation problems.

Corrections cover calendar week/day/list labels, weekdays/months, availability,
recurring setup/removal, customer statistics/types/statuses/history, finance cards,
charts/tooltips/legends, reports, settings, marketing, account tabs, loyalty,
booking-management policy feedback, public business hours, and accessible labels.
New static copy uses descriptive `labels`, `audit` and `feedback` keys in the existing
English/German next-intl dictionaries. Existing stable UI keys remain compatible.
Lookups handle display case consistently. Required plural/interpolated messages use
ICU rather than English suffixes. Dates use `de-CH`/`en-GB`; Zurich scheduling keys,
DST behavior, status codes, IDs and calculations remain unchanged.

Shared controls now translate static option/search labels while explicitly preserving
authored service/customer/promotion option names. Public announcements and Contact
content are rendered from their already-localized stored fields without translating
authored prose again. Independent dashboard/content-editing preferences are retained.
Missing editable German values remain empty; public content fallback remains intact.

Customer type/status badges use sufficient width, `whitespace-nowrap` and shrink
protection. Existing responsive navigation/grid/table scrolling is preserved.

A browser-discovered render defect was also corrected: customer detail views without
completed appointments previously dereferenced a null last visit. Two optional display
chains now render the existing empty value without changing customer/booking logic.

## Reports and exports

Financial, customer and register report captions are localized at render/export time.
Unprefixed protected export endpoints accept only `en`/`de` display preferences, using
an explicit query parameter or the existing locale cookie/default. Authorization,
status/identifier values, report numbers, amounts and stored snapshots are unchanged.
Financial report row dates are formatted from their keys rather than reusing a saved
German display caption in English output. German umlauts are retained in supported
customer PDF text. Original names/notes are not translated.

CSV column headings are localized; machine-compatible status/type data and numerical
cells retain their existing values. Stored receipt artifacts are not rewritten or
regenerated as part of this audit; the original German receipt/accounting artifact
remains separate from localized UI captions and existing bilingual receipt emails.

## Automated validation

Run whenever UI copy or components change:

```sh
npm run validate:translations
npm run test:localization-audit
npm run test:i18n
npm run test:admin-content
npx tsc --noEmit
npm run lint
npm run build
```

`validate:translations` recursively checks key parity, empty values, malformed ICU,
interpolation variable/type compatibility, duplicate JSON keys, and Swiss `ss` spelling.
It checks statically identifiable translator keys and practical hardcoded JSX/display
literal branches. Duplicate values are reported informationally; existing keys are
retained to avoid breaking call sites. The unused `common` namespace and unused new
audit keys were removed. Source-text adapter keys cannot be reliably classified as
unused from direct references alone; the validator does not falsely report them as
unused. New audit keys without detectable references are reported for review.

No new dependency was installed in the application. The ICU parser already comes
with the existing next-intl dependency tree. The static scan is a maintenance gate,
not proof that every possible runtime state is localized; browser and synthetic
integration tests complement it.

## Browser and safety coverage

The optional harness uses actual application components and synthetic records with
mocked actions, not a duplicate mock UI. It exercises the six content editors, all
four UI/content combinations, success/failure drafts, reset, keyboard and persistence;
public/admin navigation; dashboard; calendar week/day/list; availability; customer
list and empty-history details; finance overview, transactions, receipts, sales,
register and report pages; settings; recurring setup; business hours and email history.
The audit mode checks both locales at 375, 768, 1024, 1280 and 1440px, alongside the
existing eight-width navigation coverage.

```sh
ESBUILD_MODULE_PATH=/path/to/external/node_modules/esbuild \
PLAYWRIGHT_MODULE_PATH=/path/to/external/node_modules/playwright \
CHROME_EXECUTABLE_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
I18N_TEST_URL=http://localhost:3000 I18N_AUDIT_BROWSER=1 \
node scripts/test-admin-content-browser.cjs
```

Real public Chrome routing/switching and anonymous protected-route checks use
`scripts/test-i18n-browser.cjs`. No existing account is signed in or modified by the
harness. No real appointments, payments, emails or WhatsApp messages are created.
No schema/RLS, hosted Auth, SMTP, booking or payment logic is changed.

`test:authorization`, `test:security-booking` and `test:pos` remain skipped because they
require an isolated database, which the owner declined. Mocked authorization/query
checks do not establish actual PostgreSQL RLS enforcement. Live authenticated CRUD,
every combination of populated production records, provider-generated error strings,
and live notification delivery are not claimed as browser-verified. Authentic review
text, customer-authored content, technical diagnostics, brand names and missing
translation source fallbacks may legitimately remain in their original language.
Existing legal placeholders still require business/legal completion rather than
invented replacement content.

## Route inventory

Both `/de` and `/en` variants were included in the source audit. UI aliases reuse the
same editor/guard instead of duplicating localization logic.

| Route | Principal component | Verification scope |
| --- | --- | --- |
| `/account` | Header, Footer, CustomerAccountView | Source + mocked booking/preferences/loyalty behavior; anonymous localized guard check |
| `/admin/appointments` | AdminAppointmentsView | Source; anonymous localized guard/alias check; module UI tested with synthetic fixtures where listed below |
| `/admin/calendar` | AdminAvailabilityCalendar | Source; anonymous localized guard/alias check; module UI tested with synthetic fixtures where listed below |
| `/admin/customers/emails` | AdminEmailHistoryView, CustomersNavigation | Source; anonymous localized guard/alias check; module UI tested with synthetic fixtures where listed below |
| `/admin/customers` | AdminCustomersView | Source; anonymous localized guard/alias check; module UI tested with synthetic fixtures where listed below |
| `/admin/finance/end-of-day` | Server page / existing alias | Source; anonymous localized guard/alias check; module UI tested with synthetic fixtures where listed below |
| `/admin/finance` | FinanceOverview | Source; anonymous localized guard/alias check; module UI tested with synthetic fixtures where listed below |
| `/admin/finance/receipts` | FinanceReceipts | Source; anonymous localized guard/alias check; module UI tested with synthetic fixtures where listed below |
| `/admin/finance/register` | RegisterManager | Source; anonymous localized guard/alias check; module UI tested with synthetic fixtures where listed below |
| `/admin/finance/reports` | FinancialReportsPanel | Source; anonymous localized guard/alias check; module UI tested with synthetic fixtures where listed below |
| `/admin/finance/sales` | SalesManager | Source; anonymous localized guard/alias check; module UI tested with synthetic fixtures where listed below |
| `/admin/finance/transactions` | FinanceTransactions | Source; anonymous localized guard/alias check; module UI tested with synthetic fixtures where listed below |
| `/admin/homepage-content` | Server page / existing alias | Source; anonymous localized guard/alias check; module UI tested with synthetic fixtures where listed below |
| `/admin/marketing` | AdminMarketingView | Source; anonymous localized guard/alias check; module UI tested with synthetic fixtures where listed below |
| `/admin` | AdminDashboardView | Source; anonymous localized guard/alias check; module UI tested with synthetic fixtures where listed below |
| `/admin/selected-work` | Server page / existing alias | Source; anonymous localized guard/alias check; module UI tested with synthetic fixtures where listed below |
| `/admin/services` | Server page / existing alias | Source; anonymous localized guard/alias check; module UI tested with synthetic fixtures where listed below |
| `/admin/settings` | AdminSettingsView | Source; anonymous localized guard/alias check; module UI tested with synthetic fixtures where listed below |
| `/admin/site-settings/announcements` | AnnouncementsManager | Source; anonymous localized guard/alias check; module UI tested with synthetic fixtures where listed below |
| `/admin/site-settings/business-hours` | BusinessHoursManager | Source; anonymous localized guard/alias check; module UI tested with synthetic fixtures where listed below |
| `/admin/site-settings/contact` | ContactSettingsManager | Source; anonymous localized guard/alias check; module UI tested with synthetic fixtures where listed below |
| `/admin/site-settings/homepage-content` | HomepageContentManager | Source; anonymous localized guard/alias check; module UI tested with synthetic fixtures where listed below |
| `/admin/site-settings/loyalty` | LoyaltySettingsManager | Source; anonymous localized guard/alias check; module UI tested with synthetic fixtures where listed below |
| `/admin/site-settings` | Server page / existing alias | Source; anonymous localized guard/alias check; module UI tested with synthetic fixtures where listed below |
| `/admin/site-settings/selected-work` | SelectedWorkManager | Source; anonymous localized guard/alias check; module UI tested with synthetic fixtures where listed below |
| `/admin/site-settings/services` | SiteSettingsServicesManager | Source; anonymous localized guard/alias check; module UI tested with synthetic fixtures where listed below |
| `/admin/login` | LoginForm, Footer, Header | Source + real public Chrome routes/language checks |
| `/book` | Header, Footer, BookingSection | Source + real public Chrome routes/language checks |
| `/booking/manage/[token]` | Header, Footer, BookingManagementView | Source + mocked policies; no real private link used |
| `/forgot-password` | Header, Footer, PublicForgotPasswordForm | Source + real public Chrome routes/language checks |
| `/imprint` | Header, Footer | Source + real public Chrome routes/language checks |
| `/login` | PublicLoginForm, Footer, Header | Source + real public Chrome routes/language checks |
| `/` | BookingSection, Header, Footer, Hero, MeetTheBarber, SelectedWork, ServicesSection, ScrollVideoSection, SectionTwo, ContactSectionLoader, VisitStudio | Source + real public Chrome routes/language checks |
| `/privacy` | Header, Footer | Source + real public Chrome routes/language checks |
| `/register` | PublicRegisterForm, Footer, Header | Source + real public Chrome routes/language checks |
| `/reset-password` | Header, Footer, PublicResetPasswordForm | Source + real public Chrome routes/language checks |
| `/unsubscribe/[token]` | Server page / existing alias | Source + mocked policies; no real private link used |

## Final verification results

- **Translation validation:** 271 source files scanned; 1,917 messages per locale;
  360 static display lookups checked. Recursive keys, ICU variables/types, JSON
  duplicate keys, Swiss spelling and practical source checks passed. Forty-four
  repeated-value groups were reported informationally, not treated as unused keys.
- **New localization audit:** eight groups passed, including reported UI labels,
  Zurich DST/date behavior, plural feedback, export locale validation, bilingual
  financial/customer/register CSV/PDF rendering and immutable input checks. Negative
  validator fixtures proved that missing keys, incompatible placeholders, duplicate
  JSON keys and uncatalogued UI are rejected.
- **Regressions:** 18 existing i18n groups, 12 content-editor groups, 16 Google
  Reviews tests, 18 WhatsApp tests, 21 webhook tests, receipt PDF and both Auth
  template validations passed. Delivery/database calls were mocked.
- **Browser:** all four interface/content combinations, drafts/save failure/reset/
  keyboard/persistence passed. The expanded harness passed dashboard, calendar
  week/day/list, availability, customers/empty-history details, finance modules,
  reports, settings, recurring setup, hours and email history in both languages at
  375, 768, 1024, 1280 and 1440px. Existing navigation checks also passed 320, 430
  and 1920px. No document overflow or browser exceptions were detected.
- **Compiled application:** real public pages, language switching, cookie persistence
  and responsive checks passed. Fifty-two anonymous protected admin/customer route
  requests preserved localized redirects. German finance, calendar, customer and
  hours screenshots were visually reviewed using synthetic records.
- **Technical:** `npx tsc --noEmit`, `npm run lint` and standard `npm run build`
  passed. Only the three pre-existing admin `no-img-element` warnings remain.
- **Skipped:** isolated-database authorization, booking-security and POS suites;
  live authenticated CRUD, real notification delivery and actual RLS enforcement.
  No separate project, schema/RLS changes, live record writes, sends, deployment
  or commit were performed during this task.

## Principal changed files

- `messages/en.json`, `messages/de.json`; `src/i18n/text.ts`, `format.ts`, `http.ts`.
- Calendar/availability, appointments, dashboard, customers, recurring and business
  hours components; shared select/date controls, settings, marketing, finance,
  account/loyalty and booking-management display boundaries.
- `src/components/admin/finance/use-finance-formatters.ts` and existing formatting
  helpers; public business-hours/date display helpers.
- `src/lib/finance/reports.ts`, `src/lib/customers/exports.ts`,
  `src/lib/register/report.ts` and the four existing protected export routes.
- `scripts/validate-translations.cjs`, `scripts/test-localization-audit.cjs`, expanded
  editor/public browser harnesses, package scripts and this report.

Run `npm run validate:translations` whenever adding or changing UI text, then include
an appropriate rendered/browser check for props, enum labels and interactive states.
Do not use dictionary parity alone as evidence of translation completeness.

The final visual/customer regression also covers raw marketing consent and payment/
transaction enum display paths. Customer badges now render localized labels instead
of `NOT SUBSCRIBED`, while their stored enum values stay unchanged. The final browser
run passed the explicit German badge assertion as well as the empty-history detail
view. Source/compiled checks were rerun after these final display corrections.
