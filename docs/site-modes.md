# Public site modes

`APP_SITE_MODE` is a server-only setting. Missing means `live`; supported explicit
values are `live`, `coming_soon`, and `under_construction`. Empty, misspelled or other
values are rejected with a configuration error rather than silently exposing the live
site. Do not add a `NEXT_PUBLIC_` version. Existing `.env.local` and hosted values
were not modified by this implementation.

## Behavior

| Mode | Public document | Booking creation | HTTP / SEO |
| --- | --- | --- | --- |
| `live` | Existing website | Existing behavior | Existing SEO/status behavior |
| `coming_soon` | Editorial photographic landing page | New public single/recurring bookings denied | 200, noindex/nofollow, private/no-store |
| `under_construction` | Architectural maintenance landing page | New public single/recurring bookings denied | 503, Retry-After: 300, noindex/nofollow, private/no-store |

Preview both designs while keeping the site live:

- `/de/coming-soon` and `/en/coming-soon`
- `/de/under-construction` and `/en/under-construction`

In live mode preview routes return 200 with localized noindex metadata. An active
non-live mode overrides either preview route too: it cannot be bypassed by requesting
the other preview, `/book`, another public URL, or changing query/request headers.
Unprefixed URLs retain the existing temporary locale redirect. Localized public URLs
are internally rewritten; they are not permanently redirected to maintenance URLs.
Placeholder metadata uses one canonical localized landing URL per mode, without
changing the normal website's canonical/sitemap implementation.

503 is applied to GET/HEAD documents after Supabase session handling, preserving
refreshed cookies and request locale headers. Server Action POSTs keep their normal
response protocol so the existing locale switch works during maintenance. Public
creation is blocked independently at the mutation layer, not by trusting a header,
client button, action URL or the presence of the maintenance screen. Retry-After is a
crawler retry interval, not a promised reopening time or visible countdown.

## Preserved routes and operations

The existing Next.js 15 `src/middleware.ts` is extended, not replaced. The exact
`/api/webhooks/whatsapp` bypass is unchanged; its GET token and POST HMAC protections
remain in its existing handler. Other machine paths retain existing middleware and
endpoint authorization:

- `/api/**`, including Google OAuth auth/callback, admin test/export/receipt endpoints,
  customer receipts and `/api/internal/appointment-reminder-email`.
- `/auth/**` callbacks, Next assets/image optimization, Vercel infrastructure,
  public asset directories and the existing robots/sitemap paths.
- `/admin/**`, including admin login; `/login`, `/register`, `/forgot-password`,
  `/reset-password`; `/account` and `/dashboard`.
- Valid route shapes `/booking/manage/[token]` and `/unsubscribe/[token]`.

These exemptions grant no role or session. Existing route guards, signed management
links, RLS, API authorization, OAuth state and webhook signatures remain unchanged.
Existing cancellation/rescheduling, recurring-series management and background
occurrence/reminder jobs remain available. Admin single/recurring creation stays on
its existing authenticated/authorized entry points. Public single creation and
customer recurring creation have server-side gates; recurring creation is also
checked before customer lookup and again in the shared service. No database/schema
flag, new table, migration, RLS change or messaging-provider change is introduced.
The mode guards application entry points; no claim is made that production RLS was
retested by these mocked checks.

## Design and configuration reuse

`ComingSoon` and `UnderConstruction` are separate server components with shared
branding/header, existing language switcher, configured optional contacts and footer.
They reuse Cormorant/Inter, existing color tokens, `BrandLogo`, and the existing
`background-work.webp` photograph. Scoped CSS keeps both layouts separate from the
live site. Motion uses only a brief opacity/transform entrance and is removed for
`prefers-reduced-motion`.

Contact actions use existing public Contact settings only. Disabled Contact/social
settings are respected; absent/invalid links are omitted without constructed fallback
URLs. The maintenance account link opens the existing essential customer account.
English/German copy, metadata and accessibility labels use the existing next-intl
dictionaries; the established English brand motto remains unchanged in both locales.

## Set the mode locally

For a temporary local process, without editing existing environment values:

```sh
APP_SITE_MODE=coming_soon npm run dev
APP_SITE_MODE=under_construction npm run dev
APP_SITE_MODE=live npm run dev
```

Restart the local server after changing its environment. The browser harness uses an
isolated production build and its own ports; it does not change the user's server or
persist environment values.

## Set the mode in Vercel

1. Open the existing project → **Settings → Environment Variables**.
2. Add or edit **APP_SITE_MODE** with one exact supported value.
3. Select the intended environment(s): test **Preview** before changing Production;
   configure Development separately if desired.
4. Save, then create a **new deployment/redeployment** for that environment. Changing
   an environment value does not change an already-running deployment.
5. Check a public URL in DE and EN, an admin login, and an existing management-link
   route. Verify maintenance documents return 503 and Retry-After when applicable.
6. To restore normal operation, set **APP_SITE_MODE=live**, save and redeploy.

No Production/Preview environment variable, deployment or commit was changed by the
implementation. The current live setting/default is retained.

## Verification commands

```sh
npm run test:site-mode
npm run test:i18n
npm run test:whatsapp-webhook
npm run test:localization-audit
npm run validate:translations
npx tsc --noEmit
npm run lint
npm run build
```

Optional real-Chrome production-build checks (Playwright may live outside the repo):

```sh
SITE_MODE_BUILD_DIR=/absolute/path/to/production-build \
PLAYWRIGHT_MODULE_PATH=/path/to/external/node_modules/playwright \
CHROME_EXECUTABLE_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
SITE_MODE_SCREENSHOT_DIR=/tmp/1200-site-mode-previews \
node scripts/test-site-mode-browser.cjs
```

The harness starts three isolated processes, changes only their process environment,
and checks public routes, refreshes, real anonymous language switching, metadata,
status/cache/retry headers, reduced motion, eight responsive widths, anonymous
protected-route redirects, inert webhook access and static images. It does not submit
bookings, invoke cron jobs or send notifications. Mutation tests use synthetic mocks
and prove rejection before database/provider calls; existing live booking/reminder
regressions also use mocks. Live authenticated admin CRUD, actual production RLS,
real OAuth authorizations, Meta callbacks and notification delivery are not exercised.
Isolated-database authorization/booking-security/POS suites remain skipped per the
owner's existing safety instructions.

## Changed files

- New server-only configuration and booking gate: `src/lib/site-mode.ts`,
  `src/lib/site-mode-booking.ts`.
- Existing routing: `src/middleware.ts`; existing public single/recurring creation
  boundaries in appointment mutations, recurring service and recurring actions.
- New UI: `src/components/site-mode/{ComingSoon,UnderConstruction,shared}.tsx`,
  scoped `site-mode.module.css` and localized metadata helper.
- New preview routes: `src/app/coming-soon/page.tsx` and
  `src/app/under-construction/page.tsx` (the existing middleware supplies locale URLs).
- `messages/en.json`, `messages/de.json`, `.env.example`, package scripts and
  `scripts/test-site-mode{,-browser}.cjs`. The existing webhook test loader now
  loads the new pure configuration module; all its security assertions are retained.

## Verification results

- Ten new site-mode groups passed: configuration, path boundaries, all-mode
  middleware rewrites/status/SEO/cookies, protected/infrastructure exemptions,
  query/header bypass attempts and public single/recurring rejection before any
  database/provider call. Admin creation is not subject to the public mode gate.
- Existing regressions passed: 18 i18n groups, 12 content-editor groups, eight
  localization-audit groups, 16 Google Reviews tests, 18 WhatsApp tests, 21 webhook
  tests and receipt PDF generation. No real sends or database mutations were used.
- Translation validation, `npx tsc --noEmit`, ESLint and standard production build
  passed. Three pre-existing admin image warnings remain. The production client
  assets contain no `APP_SITE_MODE` reference.
- Real local production-build Chrome checks cover all three modes, both locales,
  direct public URLs, refresh/language switching, metadata/canonical/noindex/cache
  behavior, maintenance 503/Retry-After, assets, anonymous protected-route guards,
  inert webhook access and reduced-motion behavior. All eight requested widths
  were checked. Desktop/mobile designs were visually reviewed.
- Hosted Vercel deployment, live authenticated writes, real OAuth/Meta handshake,
  background-job execution and real delivery were not performed. The owner’s live
  environment configuration remains unchanged.
