# Google Analytics 4

## Architecture and safeguards

The repository had no Analytics tag or cookie-consent implementation. This integration uses the official `https://www.googletagmanager.com/gtag/js` tag through Next.js `next/script` with `afterInteractive`, rather than adding `@next/third-parties`. The direct integration provides explicit Consent Mode and manual page-view controls with no new dependencies. Only one stable script ID (`1200-ga4`) is used.

`src/app/layout.tsx` passes the existing site mode, canonical origin and `NEXT_PUBLIC_GA_MEASUREMENT_ID` to the client consent component. Analytics requires **all** of:

- A valid configured GA4 web-stream measurement ID.
- `NODE_ENV=production`.
- Vercel Production (`VERCEL_ENV=production`), or a non-Vercel production server. Preview/Development are excluded.
- The current browser origin exactly matches the configured HTTPS `NEXT_PUBLIC_SITE_URL`. Localhost and local IP origins are excluded even under `npm start`.
- An explicitly granted, unexpired Analytics decision.
- An allowlisted public localized route without sensitive authentication/token query parameters or fragments.

No Google tag, Analytics cookie, collect request, consent ping or preconnect is created before opt-in. Consent Mode v2 defaults to denied for `analytics_storage`, `ad_storage`, `ad_user_data` and `ad_personalization`; after opt-in only Analytics storage is granted. Advertising and Google signals stay disabled; URL passthrough is disabled. This is **basic consent**, not cookieless pre-consent measurement.

The consent choice is essential browser localStorage, not an authentication cookie. Versioned decisions expire after 180 days; malformed/expired decisions fail closed. Accept and Reject have equal prominence. Preferences use a labelled native modal dialog (keyboard focus trapping, Escape and focus restoration); essential storage cannot be disabled. The Cookie Preferences text control in the existing public and site-mode footers lets visitors withdraw without a floating overlay. Withdrawal sets the Google disable flag before updating consent, clears pending app events, removes `_ga`/`_ga_*` cookies at host/parent scopes and removes optional local duplicate markers. It does not delete Supabase, booking or locale cookies. Already transmitted data is not retroactively deleted by withdrawing. Other tabs observe consent changes via the storage event. If local storage is blocked, a choice can apply in memory for that visit; confirmed-conversion deduplication fails closed when durable storage is unavailable.

A tag already loaded in the page cannot be unloaded from JavaScript memory. It remains disabled on withdrawal/private navigation, and app helpers stop emitting. No data is buffered from pre-consent interactions for later replay. A small bounded queue contains only consented, sanitized events while an opted-in tag is loading; private navigation/withdrawal clears it.

## Public visits and privacy

`src/lib/analytics/policy.ts` allowlists `/de` and `/en` versions of homepage, `/book`, `/privacy`, `/imprint`, `/coming-soon` and `/under-construction`. All other paths are denied by default, including admin, account, dashboard, login/register/reset/recovery, booking-management tokens, unsubscribe tokens, APIs and unknown/404 routes.

Services is an existing homepage section, not a separate route. It remains covered by the homepage visit; `#services` navigation does not invent another page view. The same applies to `#booking`. Queries and fragments are never included in the app's Analytics URLs. Sensitive authentication query keys/fragments suppress tracking entirely, even on an otherwise public page.

Page views are manual with `send_page_view:false`. Root route handling and synchronous history guards prevent private-path activity from reaching the loaded tag. Repeated router replaces, rerenders, query changes and hash navigation do not duplicate views. A true navigation to another public localized pathname sends one view. A document reload is a new visit/page view; it does not replay a booking conversion. Referrers and titles are controlled public values, never document titles or raw document.referrer. Closed modes use one canonical landing path per language instead of recording placeholder rewrites as normal booking/legal visits.

**The GA4 web-stream configuration below is mandatory:** automatic Enhanced Measurement/form/outbound/history collection would bypass the app's deliberate manual event contract. It must be disabled before enabling the production measurement ID. No live GA property was changed or inspected here.

## Centralized events

`src/lib/analytics/client.ts` exports typed helpers. Generic `trackEvent` accepts only the five safe interaction names and a fixed contact-action enum, with no free-text payload object. Booking start/completion have dedicated helpers. Unknown runtime event names and arbitrary action strings are rejected/omitted. No service IDs/names, appointment IDs, reference hashes, customer names, email/phone values, notes, monetary details, user IDs or authentication values are transmitted by these helpers.

Common app parameters: sanitized `page_path`, `page_location`, fixed public `page_title`, safe `page_referrer`, `language` (`de-CH`/`en`), `site_mode` and the configured destination. Contact events may add `contact_action` (`phone`, `maps`, `review`, `instagram`). Google also generates its ordinary consented technical/session/browser data and pseudonymous cookie identifiers; this is explained in the bilingual privacy notice.

| Event | Trigger | Suggested GA4 role |
| --- | --- | --- |
| `booking_started` | First service interaction in a public booking flow | Funnel stage, not a primary key event |
| `service_selected` | Actual change of service selection inside the booking form | Funnel stage |
| `booking_completed` | Server action returns success with confirmation/management fields, immediately before showing confirmed UI | **Primary key event** |
| `booking_cta_clicked` | Existing public booking CTAs in header, hero, second section and barber section | Engagement/optional secondary key event |
| `contact_clicked` | Configured phone, directions, review or Instagram contact action | Optional secondary key event |
| `footer_developer_link_click` | Developer name link in either footer; fixed `link_location=footer`, `link_destination=linkedin` | Engagement; not a booking key event |
| `instagram_clicked` | Configured Instagram action in Contact, footer or site-mode page | Engagement/optional secondary key event |

An Instagram click emits one `contact_clicked` (action=instagram) and one `instagram_clicked`, by design. Do not sum these two distinct event types as separate people/leads.

Booking start has a per-tab flow marker so rerenders/reloads do not replay it; successful completion or the explicit “new booking” reset permits a new flow. `booking_completed` is emitted only from the confirmed-success branch, never a button, effect or restored-confirmation render. The private booking reference is SHA-256 hashed solely for a local, bounded duplicate ledger (up to 500 entries, 180 days); neither the reference nor hash is sent to Google/dataLayer. Concurrent callbacks, retries, refresh and navigation check that ledger. No server writes or booking/action changes were added. No absolute exactly-once delivery guarantee is possible with browser Analytics: blocked storage/tags, ad blockers, clearing consent/storage, network failure or browser closure can cause undercounting. Analytics failures never change booking success/failure or trigger resends.

Only live mode accepts booking events. Coming Soon and Under Construction accept public landing visits and contact/Instagram actions. The complete Analytics notice is available inside Preferences in closed modes, preserving the existing route rewrites and maintenance 503 behavior. The full `/privacy` link is available from the dialog in live mode. Existing private-account/recurring-management workflows are deliberately not tracked.

## Production configuration — before deployment

1. Use the intended GA4 property and create/select a **web** data stream with the verified production website origin.
2. Disable **Enhanced Measurement** for that stream, including history-based page views, scrolls, outbound clicks, site search, forms, video and file collection. The app sends the intended events manually. Also leave automatic/user-provided data collection, Google signals and advertising features disabled. Do not add overlapping GA/GTM/Vercel tag installations or event-creation rules that duplicate these events.
3. Set `NEXT_PUBLIC_GA_MEASUREMENT_ID` to that stream's `G-…` ID in **Vercel Production**. It is public configuration, not a secret. Existing local values were preserved; `.env.example` contains a blank example. No Preview/Development ID is needed.
4. Confirm existing `NEXT_PUBLIC_SITE_URL` is the exact canonical HTTPS production origin. Do not change it casually: existing Auth redirects and SEO also use it. Browser origin matching intentionally blocks localhost and other hosts. No additional domain configuration was introduced.
5. Public Next.js environment variables are embedded at build time: saving them requires a new build/deployment. No deployment was performed for this task.
6. In GA4, mark **booking_completed** as a key event (once per event). Keep the other funnel events unmarked unless the business deliberately wants secondary conversions. Do not create another derived booking-completion event from page visits/button clicks.
7. Optionally register event-scoped custom dimensions for `site_mode` and `contact_action`. Built-in language/page dimensions already exist. Select the minimum appropriate user/event retention in GA4 and review Google data-processing/transfer terms with the business's responsible privacy owner. The application's 180-day browser lifetime does not set GA4 property reporting retention.
8. Define internal/developer traffic filters for the owner's actual staff/test IP ranges or debug traffic as appropriate. Verify filters carefully before activating them. Development, localhost and Vercel Preview are excluded in code; production visits from an unrecognised staff device cannot be identified automatically.

The updated Analytics portions of `/privacy` and the preferences notice describe opt-in, technical data, processing abroad, lifetime, withdrawal and Google's policy. Unrelated older legal-policy sections still contain existing placeholders and require owner review; this implementation is not a claim of a complete legal compliance audit.

## Verification

Commands:

```sh
npm run test:analytics
npx tsc --noEmit
npm run lint
npm run build
```

Optional browser suites use existing externally installed Playwright/esbuild (no app dependencies added):

```sh
ESBUILD_MODULE_PATH=/absolute/path/to/esbuild \
PLAYWRIGHT_MODULE_PATH=/absolute/path/to/playwright \
CHROME_EXECUTABLE_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
node scripts/test-analytics-browser.cjs

ANALYTICS_BUILD_URL=http://localhost:3051 \
PLAYWRIGHT_MODULE_PATH=/absolute/path/to/playwright \
CHROME_EXECUTABLE_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
node scripts/test-analytics-production-browser.cjs
```

The component suite bundles the real consent and BookingSectionClient components with synthetic server actions. Its browser origin is synthetic HTTPS. The production-browser suite requires an isolated production build made with a synthetic measurement ID `G-TEST123456`, `NEXT_PUBLIC_SITE_URL=https://studio.example`, and `VERCEL_ENV=production`; start it with those server settings on the chosen upstream port. It proxies that local build onto the synthetic HTTPS origin and intercepts Google's script/collection, so it sends no real Analytics hits. Never point the synthetic-booking suite at production APIs.

Verified locally: opt-in-only tag loading; saved rejection; bilingual dialog/keyboard controls; one script/manual view; actual Next App Router public navigation; sensitive/private route suppression; withdrawal; sanitized payloads; start/completion deduplication; all three modes in mocked component tests; actual booking-component success, failure, rejected consent and throwing-tag scenarios with mocked actions. Production layouts tested at 320, 375, 390, 430, 768 and 1440px. Screenshots/logs are under `/tmp/1200-ga/`.

**Not verified:** receipt of actual events in the owner's GA property, Google Tag Assistant, Realtime/DebugView, production Enhanced Measurement/filter settings or reporting attribution. No authenticated GA management connector is available. To finish after an authorized deployment:

- In a clean browser, clear this site's consent/Analytics storage. Confirm no gtag or collect requests before a choice and after Reject; confirm essential login/booking controls still work.
- Opt in on a public page; use Google Tag Assistant and GA4 Realtime/DebugView to inspect one page view per public navigation, both languages, sanitized URLs and advertising consent denied. Do not include private links/tokens in screenshots or shared logs.
- Change Preferences to reject: confirm the Google disable flag, removal of Analytics cookies and no subsequent collection; also check another open tab. Verify admin/account/auth pages emit no events.
- Validate non-mutating public CTA/contact events. Use synthetic mocked booking tests for conversions; do not create production appointments or send customer messages to verify Analytics.

References: [Google basic consent implementation](https://developers.google.com/tag-platform/security/guides/consent), [manual page views](https://developers.google.com/analytics/devguides/collection/ga4/views), [Enhanced Measurement controls](https://support.google.com/analytics/answer/9216061), [privacy/disable controls](https://developers.google.com/tag-platform/security/guides/privacy), [Next.js 15 third-party integration](https://nextjs.org/docs/15/app/guides/third-party-libraries).

## Changed-file inventory and results

- Added `src/lib/analytics/{policy,consent,client}.ts` and `src/components/analytics/{AnalyticsConsent,PrivacySettingsButton}.tsx` plus the scoped consent stylesheet.
- Updated root layout, the privacy page, English/German dictionaries and `.env.example`.
- Added only fixed tracking attributes to existing header/hero/second-section/barber booking CTAs and Contact/Visit/footer/site-mode links. Added the privacy text control to the existing two footer implementations. Only BookingSectionClient's service-selection, confirmed-success and explicit reset branches call the booking helpers. Server booking actions, authentication, schemas/RLS, Gmail and WhatsApp were not modified.
- Added `test:analytics`, `scripts/test-analytics.cjs`, `scripts/test-analytics-browser.cjs`, and `scripts/test-analytics-production-browser.cjs`. No dependencies were added.

Final local validation: 17 pure Analytics test groups; real component browser tests for bilingual consent, rejected/missing/development/private contexts, App Router-style deduplication, successful/failed bookings, consent rejection and throwing-tag booking success, refresh/retry conversion suppression, cross-tab withdrawal and both closed modes. Production-build browser checks verified both languages, actual Next Link navigation, dialog keyboard behavior, no pre-consent tag requests, one post-consent tag, withdrawal, private exclusions and all three modes at 320/375/390/430/768/1440px, retaining coming-soon 200 and maintenance 503 responses. The privacy control has a readable 12px label and a 44px minimum target; it is integrated in the footer rather than overlaid on content. Chrome and WebKit viewport checks were used; no real-device iPhone test was performed.

TypeScript, ESLint, standard production build and translation validation passed. ESLint retains three existing admin `<img>` warnings. Existing i18n (18), site-mode (10), Google Reviews (16), WhatsApp webhook (21), localization audit (8) and SEO (6) suites passed. Production-browser tests used a synthetic ID and intercepted Google requests, so these results prove the local integration/consent contract, not live receipt in GA4 or the owner's hosted stream settings.

Not executed: isolated-database authorization/booking/POS mutation suites, real appointment/payment/account creation, real email/WhatsApp delivery, or actual GA property event receipt. No new test records required database cleanup. No hosted settings, deployment or commit was made.


## Developer credit

The identical English/German signature is `Crafted by Ez'her Memeti`. Only the name is linked. Configure the approved public profile in `src/lib/developer-credit.ts` (`developerCredit.linkedInUrl`); no second GA tag or public environment variable is needed. `DeveloperCredit` is reused by the regular and site-mode footers, with a localized screen-reader label announcing LinkedIn/new-tab behavior, a visible keyboard focus outline, and a 44px link target.

One delegated click listener sends `footer_developer_link_click` through the existing consent-aware typed helper. Its only custom fields are `link_location: footer` and `link_destination: linkedin`; it does not send the name, URL or visitor information. Existing sanitized public context is retained. Rejected/withdrawn consent, private routes, development/Preview and unavailable Analytics suppress tracking while the native link still opens. No direct React onClick handler duplicates the global listener.

After an authorized production deployment, opt in, click the developer name once and inspect `footer_developer_link_click` in GA4 Realtime, or use Tag Assistant with DebugView. Inspect the two fixed event parameters. Repeat after rejecting consent: the link should still open, with no new app event. The feature is verified locally with intercepted tag/LinkedIn requests; real GA4 receipt was not verified. This is an engagement event and should not be marked as a booking key event.


## Premium consent modal and compatible records

The initial banner is replaced by the same centered native dialog used by the footer Cookie Preferences control. On a localized public page it opens automatically only when no valid decision exists. New visitors start with Analytics off. Accept All and Reject All are equally prominent and each saves/closes immediately; neither requires changing a toggle. Preferences reveals essential cookies (always on, disabled control) and an interactive Analytics switch. Save Preferences applies the draft. Reject All always saves false regardless of the draft.

The dialog makes background content inert through `showModal()`. An explicit Tab/Shift+Tab cycle keeps focus on its current visible controls consistently in Chrome and WebKit, including when native keyboard settings skip buttons. Browser modifier shortcuts remain available. Background scroll is locked only while open; the prior body overflow value is restored afterward. Close/Escape never grant permission. Focus initially lands on the modal heading; after closing it returns to the opener, or a visible page entry control without scrolling. Closing without choosing defers the prompt for the current App Router visit; it does not invent a saved rejection. Reject All is the explicit durable 180-day option. English and Swiss German labels/confirmation announcements use next-intl; language navigation does not reset storage. The compact initial dialog and detailed view share one implementation, muted gold accents, existing fonts and a short reduced-motion-aware entrance. Mobile sizing uses dynamic viewport height, safe-area insets, a separately scrollable content area and full-width actions. The decision buttons remain visible outside that scrolling area.

The existing `1200_cookie_consent_v1` key and `version: 1` remain. New writes contain `status` (`accepted` or `rejected`), `analytics`, `decidedAt` (Unix milliseconds), `policyVersion: analytics-v1`, and `expires` (180 days after the explicit decision). Existing records with only version/analytics/expires are normalized **in memory**, with the same permission and expiry, without rewriting or renewing them. Their original decision time is derived from the original 180-day expiry. Both accepted and rejected legacy decisions suppress the prompt until expiration. Merely opening or closing preferences never extends expiry.

This presentation change does not change the Analytics policy, so no consent-version reset is necessary. Explicit records with another policy identifier, malformed/inconsistent records and expired records fail closed. If the policy materially changes in future, update `CONSENT_POLICY_VERSION`; legacy implicit analytics-v1 records will then also require a new decision. No authentication, database or visitor account is needed.

Withdrawal still uses the existing Google disable flag, denied Consent Mode update, Analytics-only cookie cleanup and cross-tab storage synchronization. All seven current app events, including the developer credit, booking completion deduplication, private-route/environment exclusions, and all three site modes are preserved. Modal display is separate from Analytics eligibility so it can also be reviewed on public localhost/Preview pages. Accepting there saves permission but never bypasses the existing production/origin/ID guards. Admin, authentication, customer-private and sensitive-token routes do not auto-prompt; the footer preferences control remains usable.

Modal-specific validation adds legacy accepted/rejected compatibility, complete new record fields, original-expiry preservation, footer switch state and focus restoration, rejection of an unsaved enabled toggle, direct Accept All, return/reload/language behavior, cross-tab withdrawal, native focus trapping, Escape, background scroll restoration, mobile bounds and reduced motion. Google tag/collection is intercepted in browser tests. These local tests do not verify real GA4 receipt or actual production database RLS enforcement. No live notifications, customer accounts, appointments, hosted changes, commits or deployments were made.

Final modal verification passed against the normal production build in Chrome and WebKit: both languages at 320, 375, 390, 430, 768 and 1440px, forward/reverse Tab containment, Escape, background lock/restoration, persistent rejection, opt-in, actual App Router navigation, one tag/page view, withdrawal and private exclusions. Both closed modes also passed with their original 200/503 behavior. WebKit iPhone emulation at 320px wide and 500/568/668px heights verified that every decision button remains fully visible, the detailed toggle can be changed, no tag is requested before consent, and rejection removes a synthetic Analytics cookie while retaining a synthetic essential cookie. Real-device iPhone Safari was unavailable. TypeScript, ESLint, translation validation, 17 Analytics test groups, mocked booking/notification-independent browser flows, and the standard production build passed. Three pre-existing admin image lint warnings remain. Screenshots and logs: `/tmp/1200-consent-modal/`.
