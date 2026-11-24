# English and Swiss German localization

## Audit and implementation

The application uses Next.js 15.5.28, React 18 and next-intl 4.15.3. Existing page
modules, server actions, appointment rules and authenticated role checks are reused.
There were no existing locale dictionaries. The UI inventory found 855 distinct
static JSX texts/labels; the dictionaries additionally cover option labels, status
display labels, validation responses and communication copy. Google review content,
customer data, status identifiers, CHF amounts and business calculations are not translated.

`admin_settings` was inspected read-only for `business`, `booking`, `finance` and
`notifications`. Booking/finance values and notification switches are technical.
Business name, address, phone, email and sender identity are preserved. Loyalty
settings contain numeric reward rules and identifiers; their displayed descriptions
are translated without changing the underlying rules.

The repository's middleware was at the root while the app is under `src/app`.
It is now at `src/middleware.ts`, where Next.js loads it. Locale rewrites retain
the internal request origin so a bound dev server does not proxy back through its
own locale redirects. Public redirect destinations retain the incoming host.
Supabase session refresh forwards updated cookies to the rewritten server render
and the browser, retaining locale request headers and cookie flags.

## Routing and switching

- `/de` is the default; `/en` is the secondary locale.
- All existing UI paths support prefixes, including admin/customer pages.
- `/de/book` and `/en/book` reuse the existing BookingSection.
- `/de/dashboard` and `/en/dashboard` resolve to the existing account page.
- Existing unprefixed links redirect to the saved locale, otherwise German.
- Invalid two-letter locale prefixes return 404.
- API, Google OAuth callbacks, internal reminder jobs, assets and webhooks retain
  their original unprefixed URLs. Locale-prefixed API paths return 404.
- The exact WhatsApp webhook remains exempt from browser-session middleware;
  token/HMAC verification remains in the unchanged route handler.

Next.js rewrites localized URLs to the existing page modules rather than duplicating
page trees or moving server-action imports. Request-scoped next-intl configuration
uses the validated locale header. Root HTML language, provider messages and metadata
are rendered on the server. The DE/EN switch performs a document navigation after
saving the preference, so root layout language and metadata are refreshed reliably.
It preserves route, query and hash. Other navigation retains Next.js client routing.

Use `src/i18n/navigation.ts` for application links and client navigation. Machine
endpoint/download URLs must remain plain, unprefixed links. Shared path helpers in
`src/i18n/config.ts` preserve queries, hashes and external URLs.

## Preference policy

Only an explicit DE/EN selection writes a saved language. Visiting another locale
URL does not overwrite account preferences. Anonymous selection uses the HttpOnly,
SameSite=Lax, root-path `1200_locale` cookie (one year; Secure in production).
Authenticated selection updates only the verified user's linked customer/profile
and Auth email-language metadata. No user ID is accepted from the browser.

For linked customer accounts, `customers.preferred_locale` is canonical;
`profiles.preferred_locale` is its mirror. Accounts without a customer use the
profile preference. New signup metadata initializes missing preferences only;
existing non-null customer/profile choices are not overwritten. Sign-in restores
the stored choice. Auth metadata is used by the Supabase email templates, never
for role authorization. If a mirror write fails the switch reports an error and
can be retried; effective resolution always prioritizes the canonical customer.

Appointments store the request language in `booking_locale`. Recurring appointments
created in a UI request do the same; background generation uses the customer's saved
preference, falling back to German. Notification
language resolves saved customer preference, then appointment booking language,
then German. Unsaved nullable preferences do not override an English guest booking.

Dates are presented using `de-CH` / `en-GB` and Europe/Zurich. Scheduling/date keys,
DST calculations, prices, CHF and financial snapshots retain their existing behavior.

## Database content and editors

The already-created `_de`, `preferred_locale` and `booking_locale` columns are reused.
No columns, migrations, policies, identifiers or business records are recreated.
Public content helpers resolve non-empty German text with original-source fallback.
Homepage content is checked for `text`/`textarea` and URL/configuration-like values
before translation; media and configuration are preserved.

Many existing source columns already contained German rather than English. Their
original values were preserved. `messages/content-en.json` supplies reviewed English
presentation overrides only for exact matching original strings; subsequent edited
English source content is used normally.

Existing content-management pages now use one independent EN/DE content switch
inside their existing editor layout. Separate German editing panels have been
removed. Draft preservation, active-language saves and reset behavior are documented
in [admin-content-editing.md](admin-content-editing.md). The dashboard locale remains
independent of the persisted local editing-language preference.

The reviewed `scripts/i18n/content-backfill.json` contains 71 guarded proposals.
On 2026-11-22 those 71 previously empty German fields were populated. Read-back
verification checked original content across 47 rows and found it unchanged; a
second dry run found zero eligible updates. Test announcements/marketing test bodies,
names, addresses, numeric years, hairstyle names and the brand motto were not replaced.

```sh
node --env-file=.env.local scripts/backfill-german-content.mjs
# Only after reviewing the proposal file and current original values:
node --env-file=.env.local scripts/backfill-german-content.mjs --apply
```

The script's default is read-only. Apply rechecks the exact original value and an
empty target immediately before updating only the `_de` column. Existing translations
or changed source values are skipped.

## Customer communications

Booking confirmation, cancellation, rescheduling, reminder, recurring variants and
receipt email builders select language before rendering. Authored copy and service
labels are localized; escaped customer names and private link parameters remain intact.
Receipt PDFs remain existing immutable financial attachments; their stored snapshots,
numbers and calculations are not regenerated or translated.

Marketing campaigns can store independently authored German subject, preheader,
headline, body and CTA text under `audience_filters.localized_content.de` in the
existing JSONB snapshot. This adds no table/column or campaign record. Recipient
filter logic ignores the localization property. The composer restores German draft
copy and resolves it per recipient; missing German copy temporarily falls back to
original content. Footer/unsubscribe links use the recipient's locale and retain
existing signed tokens and consent/idempotency controls. Review authored German copy
before sending. Existing test-only marketing bodies are not turned into real copy.

### Supabase Auth deployment actions (not performed)

Only Confirm Signup and Reset Password are supported. Their local HTML keeps the
approved layout and `{{ .ConfirmationURL }}` CTA. Exact Go-template branches use
`.Data.preferred_locale == "en"`, otherwise German. The two corresponding local
subjects in `supabase/config.toml` use the same condition. No hosted templates or
SMTP settings were modified.

After approval, copy each HTML body and its subject from the local configuration to
the corresponding hosted Supabase template and save/verify each separately. Add these
redirect URLs for each authorized application origin (including Preview origins):

- `/de/login` and `/en/login` for signup confirmation.
- `/de/reset-password` and `/en/reset-password` for recovery.

Retain existing allowed legacy URLs while older emails remain valid. Do not change
Google OAuth redirect URIs or webhook URLs. Recovery retains the existing PKCE/browser
binding. Auth metadata is synchronized when a user explicitly saves a language.

```sh
node scripts/validate-auth-email-templates.mjs --preview-dir /tmp/1200-auth-previews
```

This renders safe DE/EN placeholders and validates the restricted template expressions;
it does not send email or change hosted configuration.

### WhatsApp limitation

The inspected repository implements a test-only provider restricted to explicit
allowlisted recipients and the `hello_world` / `en_US` template. It does not currently
send customer booking/reminder WhatsApp templates. Local Meta credentials were not
available for approved-template inspection. No German Meta template name/language
was guessed, no production customer messaging was enabled, and no WhatsApp message
was sent. Customer WhatsApp localization needs the actual approved template catalog
and approved German/English variants before those sends can be implemented/verified.
Existing test sends, signatures, webhook status updates and delivery tracking remain.

## Verification and release checklist

```sh
npm run test:i18n
npm run test:google-reviews
npm run test:whatsapp
npm run test:whatsapp-webhook
npm run test:receipt-pdf
npx tsc --noEmit
npm run lint
npm run build
```

`test:i18n` covers locale validation, missing translations, notification precedence,
ICU counts, marketing language resolution, middleware exclusions, refreshed session
cookies, guarded backfill proposals and rendered email variants with mocked delivery.
It does not send messages or write database records.

Optional read-only browser smoke test (Playwright may be installed outside the repo):

```sh
PLAYWRIGHT_MODULE_PATH=/tmp/1200-i18n-browser/node_modules/playwright \
CHROME_EXECUTABLE_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
I18N_TEST_URL=http://localhost:3000 node scripts/test-i18n-browser.cjs
```

This checks real switching/persistence, public routes, HTML language and responsive
layout. Authenticated admin CRUD, registered/guest booking mutations and loyalty/payment
changes are verified with synthetic mocked Supabase clients. Existing
`test:authorization`, `test:security-booking` and `test:pos` deliberately refuse to
run without isolated credentials; do not point them at production to force a pass.
No real customer appointments or notifications were used for verification.

The owner explicitly requested skipping suites that require an isolated database.
Mocked role/query tests verify application behavior, not actual database RLS enforcement.
No isolated project or additional infrastructure is required for this implementation.

Before production sign-off: install and verify hosted Auth templates and redirect allowlists; supply approved
Meta template languages; review pre-existing legal placeholders and test campaign
copy. No deployment or commit is part of this change.

## Completed verification — 2026-11-22

- `npm run test:i18n`: 18 grouped tests passed, including real booking,
  managed-mutation and recurring-reservation functions with synthetic Supabase clients.
- Google Reviews: 16 tests passed; real-Chrome animation regression also passed.
- WhatsApp: 18 provider/endpoint tests and 21 webhook tests passed with mocks.
- Receipt PDF regression and both bilingual Auth template validations passed.
- `npx tsc --noEmit`, `npm run lint` and standard `npm run build` passed.
  Lint retains three pre-existing `no-img-element` warnings in admin image editors.
- Chrome public-route and language-switch/persistence checks passed in development
  and against the compiled production build. Both locales passed viewport widths
  320, 390, 768, 1024, 1280 and 1440px without document overflow or browser errors.
  German/English login and Auth template previews were visually inspected.
- Fifty unauthenticated localized admin-route requests on the production build
  redirected to the corresponding localized admin login page.
- `test:authorization`, `test:security-booking` and `test:pos` were not executed
  successfully: they require an isolated database, which the owner declined.
  No claim of verified PostgreSQL RLS enforcement or live authenticated CRUD is made.
- No real accounts, appointments, payments, emails or WhatsApp messages were created
  for tests. Hosted Auth settings, SMTP, schema and RLS policies were not changed.
  The previously authorized 71-field German public-content backfill described above
  was an implementation operation, not a database-mutating test.
