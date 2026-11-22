# Multilingual admin editing

## Independent preferences

The existing next-intl URL and authenticated preference mechanism controls the
**dashboard interface**. `AdminContentLocaleProvider` controls only editable content.
It defaults to German and persists `en`/`de` under localStorage key
`1200_admin_content_locale`. It never calls preference actions, changes the URL,
or writes customer, profile or booking locales. Blocked localStorage falls back to
an in-memory preference. Storage changes from other tabs are synchronized.

Editor content stays hidden until the stored editing preference has been read;
server/client initial renders agree, without briefly displaying the wrong language.
The compact switch uses native focusable buttons with `aria-pressed` and an
accessible group label. Normal Tab, Enter and Space interaction is supported.

## Updated editors and data mapping

| Editor | Localized fields | Shared values retained |
| --- | --- | --- |
| Homepage | `value` / `value_de` for runtime text/textarea content | Media, paths, configuration, section ordering |
| Services | `name` / `name_de` | IDs, price, duration, image, visibility, order |
| Announcements | `title`, `message`, `cta_text` and `_de` counterparts | Type, URL, schedule, priority, visibility, dismissibility |
| Selected Work | `title` / `title_de` | Image, visibility, order |
| Contact | Eyebrow, title, description, call/Instagram/leave-review labels and `_de` counterparts | Address, phone, URLs, usernames, visibility |
| Marketing templates | Name, description, subject, preheader, headline, content, CTA text and `_de` counterparts | CTA URL, active status, existing identity/configuration |
| Campaign composer | Existing source copy and `translations.de` | Campaign identity, CTA URL, audience and sending rules |

Homepage `label` / `label_de` remain field-caption metadata selected for the
**dashboard** language. They were not editable in the original accordion and are
not silently rewritten when its content language changes. Runtime `content_type`
and original value are checked before choosing the localized value column.

The current Contact implementation has no English `reviews_cta_label` field or
separate Read Reviews action. Its existing Leave Review action is supported; this
change does not invent a new action, source column or schema migration.

## Drafts, saves and resets

Each existing form retains one shared state and separate English/German text drafts.
A missing German translation is empty, never an English fallback. Switching only
changes field mapping; accordions, shared settings, images and drafts stay mounted.
Public website fallback behavior is unchanged.

Campaign draft updates preserve the inactive copy inside the existing JSON column;
a timestamp check detects concurrent updates instead of overwriting newer drafts.
Sending/review actions retain their existing bilingual campaign behavior.

Server actions retain their existing admin authorization and validation. They use
explicit server-owned localized field lists: updates omit the inactive language
entirely. Shared configuration can be saved from either language. Required active
language fields are validated. New items that require English source text must have
those fields explicitly filled before creation; switching back to English preserves
the German draft. Creation stores the explicitly entered bilingual drafts, with
empty optional German fields stored as null. Existing records are never populated
from public fallback text.

Successful saves keep the form and inactive draft open. Created item IDs are returned
so subsequent saves update the same record. Failures retain drafts and identify the
attempted language. Homepage section saves retain their existing per-row persistence;
partial failure lists the unsaved fields and does not claim complete success.

Homepage English Reset to Default stages existing source defaults for localized text
only. German Discard Changes restores its last server-loaded German values; there
are no invented German defaults or source-to-German copying. Contact Reset restores
only the selected language's text. Neither reset changes the other draft or shared
settings. Reset values require an explicit save.

In-memory drafts survive language switches and saves while the editor remains open.
As before, leaving/cancelling an editor or refreshing the document discards unsaved
drafts. Only the selected editing language is persisted across pages and refreshes.

## Responsive navigation

The public header uses the existing compact menu below 1280px, leaving room for
longer signed-in German labels. The desktop row uses controlled gaps, nonwrapping
labels and fixed-size logo/CTA/language controls. The admin sidebar uses less letter
spacing and safe wrapping; its narrow drawer avoids squeezing the logo, caption
and close button together. Existing menu/navigation behavior is retained.

## Verification

```sh
npm run test:admin-content
npm run test:i18n
npm run test:google-reviews
npm run test:whatsapp
npm run test:whatsapp-webhook
npm run test:receipt-pdf
npx tsc --noEmit
npm run lint
npm run build
```

The optional browser harness renders the actual editor/header/sidebar components
with synthetic records and mocked server actions. It creates a temporary local
bundle and removes it afterward. It never loads production credentials or executes
real writes or sends. Start a local application to supply compiled site CSS, then:

```sh
ESBUILD_MODULE_PATH=/path/to/external/node_modules/esbuild \
PLAYWRIGHT_MODULE_PATH=/path/to/external/node_modules/playwright \
CHROME_EXECUTABLE_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
I18N_TEST_URL=http://localhost:3000 \
node scripts/test-admin-content-browser.cjs
```

This checks all four UI/editing-language combinations, draft preservation after
successful/failed saves, reload/navigation preference persistence, keyboard controls,
locale-only reset, and public/admin menus at 320, 375, 430, 768, 1024, 1280, 1440 and
1920px in both languages. The signed-in header state is synthetic. Actual public
routing/switching is separately checked by `scripts/test-i18n-browser.cjs`.

Authorization, booking-security and POS suites that require an isolated Supabase
project remain skipped at the owner's instruction. Mocked authorization/database
checks are not proof of actual PostgreSQL RLS enforcement. No live authenticated
CRUD, customer records, appointments, payments or notifications are used in tests.
No schema, RLS, hosted settings, SMTP, booking or messaging changes are required.

## Files and components changed

- Shared state/control: `src/components/admin/content/AdminContentLocale.tsx`;
  field mapping and server payload isolation: `src/i18n/content-editing.ts`.
- Existing form components: `HomepageContentManager`, `SiteSettingsServicesManager`,
  `AnnouncementsManager`, `SelectedWorkManager`, `ContactSettingsManager`,
  `AdminMarketingView`, and `MarketingAudienceReview`.
- Admin dashboard layout and the six corresponding content pages now use the shared
  provider/readiness boundary. The old `ContentTranslations` and `TranslationFields`
  components were removed.
- Their existing server actions, homepage/contact queries and content input types
  now carry explicit drafts and choose language-specific columns.
- Navigation layout: `HeaderClient` and `AdminShell`; Contact preview displays the
  edited heading without translating it into the dashboard language.
- English/German dictionaries, localization documentation, `test:admin-content`,
  `scripts/test-admin-content.cjs`, `scripts/test-admin-content-browser.cjs`, and
  expanded viewport coverage in `scripts/test-i18n-browser.cjs`.

## Results — 2026-11-22

- 12 synthetic server/draft test groups passed (`test:admin-content`).
- Browser harness passed all six editors in all four UI/content combinations,
  successful/failed saves, campaign composer drafts, selected-language reset,
  missing translations, keyboard use and refresh/navigation persistence.
- Public header and admin shell passed both languages at all eight requested widths,
  including the synthetic signed-in admin header label. Mobile menus worked and
  no document overflow or desktop-header collisions were detected.
- Compiled production public routes, actual language switching and preference
  persistence passed Chrome checks, including the expanded responsive widths.
- TypeScript, ESLint and the standard production build passed. Three existing
  `no-img-element` warnings remain in admin image editors.
- Existing suites passed: 18 localization groups, 16 Google Reviews tests,
  18 WhatsApp tests, 21 webhook tests, receipt PDF and both Auth templates.
- German dashboard/English content mobile and desktop editor screenshots were
  visually reviewed using synthetic data. No live writes, accounts, appointments,
  payments, emails or WhatsApp sends were used. No deploy or commit was performed.
