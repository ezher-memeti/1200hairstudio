# SEO audit and production checklist

Audit date: 23 November 2026. Next.js 15.5.28 App Router, next-intl, two localized URL trees. Changes are local; no deployment, hosted configuration changes, database mutations, customer messages or Google account actions.

## Original findings

- Root metadata already used the Next Metadata API, HTML lang, localized titles, canonical URLs and reciprocal de-CH/en/x-default links. Private routes already had noindex and server authorization. Preserve these protections.
- Public descriptions were duplicated across homepage, booking and legal pages. Unknown routes inherited indexable homepage metadata. Social metadata omitted explicit type, image and Twitter card.
- No robots route or LocalBusiness JSON-LD existed. Sitemap always listed normal content, even when site modes replaced it with placeholders. It correctly omitted fabricated modification dates.
- `/book` rendered its main heading as H2, leaving no H1. Homepage/legal pages each had an H1. Portfolio buttons had blank accessible names where optional titles were absent.
- At the original audit, the referenced wide OG artwork was absent from the tracked repository (superseded by the 24 November brand integration below). The existing approved logo is a real 1562×1562 PNG; reuse it with truthful dimensions and a square summary card. No new visual design was generated.
- Public content, services and Places fetches already use request-level deduplication. Places stays server-side, uncached across requests, with its existing timeout and attribution. No API integration changes were required.
- The hero is a canvas-driven, 228-frame WebP sequence, not a video element. It already uses an SSR poster, bounded concurrent loads, directional prefetch, decoded-frame eviction and off-screen suspension. Initial frame traffic was seven requests before interaction.
- Translation bundle initialization repeatedly spread the entire German dictionary inside every mapping iteration. This quadratic allocation was a measurable main-thread risk. The dictionary now builds once without changing translations.
- Local NEXT_PUBLIC_SITE_URL is http://localhost:3000. This is appropriate locally, but is not evidence of a configured production canonical domain. No production hostname was assumed.

## Implementation and files

- `src/lib/seo/metadata.ts`: one indexable route registry (`/`, `/book`, `/privacy`, `/imprint`), unique bilingual titles/descriptions, self canonicals, de-CH/en/x-default alternates, absolute OG/Twitter logo metadata. Other routes default noindex with no canonical/alternates or private URL in social metadata.
- `src/i18n/metadata.ts`: existing root generateMetadata delegates to that registry, preserving localized authentication page labels.
- `src/app/robots.ts`: dynamic robots document allows public rendering and assets; excludes machine API/Auth paths from crawling. Account/admin pages remain protected by authentication and noindex, rather than relying on robots for confidentiality. Crawlers can see temporary noindex responses.
- `src/app/sitemap.ts`: dynamic at request time; eight localized public URLs in live mode, empty valid sitemap in both closed modes. Reciprocal language alternates include x-default. No invented lastmod, IDs, token URLs, previews or private routes.
- `src/lib/seo/business.ts` and `src/app/page.tsx`: one server-rendered HairSalon entity per live homepage. Stable origin/#business ID across languages. Name, localized description, existing portrait/logo and motto; postal address from the same homepage settings displayed by VisitStudio/Footer. Phone and Instagram only from enabled public contact settings. Hours only from real business_hours rows. No geo inference, invented priceRange, review or aggregateRating. No fabricated services/offers. No price information is added; existing service prices remain CHF. Managed text is escaped against closing-script injection.
- `src/components/layout/Footer.tsx`: replaces the generic Instagram homepage with the existing enabled, verified-format profile URL; omits an unavailable link. Uses the existing request-cached public settings reader, without duplicate homepage queries.
- `src/lib/public/business-hours.ts`: React request cache shares the hours read with VisitStudio. No cross-user or persistent cache is introduced.
- `src/components/site-mode/metadata.ts`: branded localized social metadata and fallback language annotation retained alongside noindex and dedicated placeholder canonicals.
- Privacy and imprint pages: allow long German compounds to wrap inside their existing containers; fixes the measured 489px document width on a 320px privacy viewport without changing desktop typography.
- BookingSection, BookingSectionClient, `src/app/book/page.tsx`: heading tag prop gives only standalone booking an H1; homepage retains H2. No booking logic changes.
- `src/components/home/ScrollVideoSection.tsx`: initial look-ahead six to two (three initial frame requests including poster), explicit high fetch priority on poster; original scroll buffer/visuals/interactions remain.
- `src/components/home/MeetTheBarber.tsx`: responsive sizes reflect the actual bounded portrait instead of half the desktop viewport.
- `src/components/home/CircularGallery.tsx`: optional missing titles use the existing localized image label for alt/accessibility; no invented captions or reviews.
- `src/i18n/text.ts`: build the German map once instead of once per dictionary entry. Outputs preserved.
- `.env.example`: documents production origin requirements without changing values.
- `scripts/test-seo.cjs`, `scripts/test-seo-browser.cjs`, package script `test:seo`: synthetic logic checks and optional read-only production browser checks.

## Modes and indexing

APP_SITE_MODE is resolved by existing server-only code at request time. Dynamic sitemap follows that value on the running server. Vercel environment edits still need a new deployment to change the process environment; there is no manual SEO code toggle.

| Mode | Public document | Indexing | Sitemap |
| --- | --- | --- | --- |
| live | 200 normal content | public route registry indexed; private/preview paths noindex | eight URLs |
| coming_soon | 200 branded placeholder | noindex, one dedicated canonical per locale | empty |
| under_construction | 503 + Retry-After: 300 | existing noindex placeholder; no permanent redirect | empty |

Essential Auth/admin/account/management/API/webhook paths retain their existing handling. No crawl blocking of CSS, JavaScript, images or frames. Unprefixed UI URLs retain the existing 307 locale redirect; explicit /de and /en remain accessible regardless of locale cookies or browser language. No crawler-specific locale forcing was added. Trailing-slash normalization and query-free canonicals prevent alternate forms from being canonical targets.

Keep full-site maintenance brief. Extended 503 or noindex placeholders can reduce indexing; returning to live automatically restores normal metadata/sitemap, but search recovery depends on recrawling. See [Google guidance on temporarily pausing a website](https://developers.google.com/search/docs/crawling-indexing/pause-online-business).

## Validation and reproduction

`npm run test:seo` uses synthetic content, environment values and no database access. Browser checks require an isolated existing production build and externally installed Playwright; no dependency was added to the app:

```sh
SEO_BUILD_DIR=/absolute/path/to/build-copy \
PLAYWRIGHT_MODULE_PATH=/absolute/path/to/playwright \
CHROME_EXECUTABLE_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
node scripts/test-seo-browser.cjs
```

The browser suite starts/stops its own servers on 3041–3043 and checks both locales, four public pages, all three modes, six widths (320, 375, 390, 430, 768, 1440), rendered metadata, schema/visible address and hours, social image accessibility, raw Googlebot HTML, robots/sitemap, anonymous private noindex, unprefixed redirect and unknown-page 404. It never submits an authentication or booking form.

Local artifacts: `/tmp/1200-seo/` contains isolated-build logs, screenshots, browser metrics and Lighthouse JSON reports. Performance results are lab measurements, not field 75th-percentile Core Web Vitals. Lighthouse TBT is not INP. Production network/CDN, real-user INP and field CWV require production measurements/Search Console.

## External production steps and remaining risks

1. Confirm the actual canonical custom HTTPS origin in existing Vercel production NEXT_PUBLIC_SITE_URL. It must have no path/query and must not be localhost or a Preview hostname. This value also serves existing Auth redirects: verify allowlisted Supabase redirect URLs before changing it. No environment values were changed here.
2. In Vercel, verify the intended www/apex primary domain and HTTPS redirects. DNS/custom-domain redirect behavior was not verified without a known production hostname. Keep Preview protected/noindex through existing Vercel controls; do not submit preview URLs.
3. In [Search Console](https://search.google.com/search-console), add a Domain property for the verified business domain. Install the exact Google-provided DNS TXT record at the DNS provider and complete verification. No speculative verification token has been added.
4. Once deployed in live mode, fetch production `/robots.txt`, `/sitemap.xml`, `/de`, `/en` and `/book` equivalents. Confirm 200, absolute production canonicals, reciprocal alternates and accessible logo. Submit `/sitemap.xml` in Search Console. Inspect both language homepages with URL Inspection/live test and request indexing as appropriate. Monitor Pages, Sitemaps, enhancements and Core Web Vitals reports.
5. Run [Rich Results Test](https://search.google.com/test/rich-results) and [Schema.org validator](https://validator.schema.org/) against the public deployed homepage. Local JSON parsing/shape/escaping checks do not constitute Google's external validation or guarantee rich results. No external private content was submitted.
6. Verify the Google Business Profile's exact name, address, phone, current hours and website match the site settings. Set its website to the selected production locale homepage and booking link to the equivalent `/de/book` or `/en/book`. No Google account/profile changes or indexing submissions were made.
7. Supply the existing approved wide OG artwork if it lives outside this repository. Current square-logo sharing is valid but is not a 1200×630 preview.
8. Public legal content still contains existing placeholder contact/legal details requiring owner/legal review. The generic footer Instagram link has been replaced with the configured profile. No addresses, hours, coordinates or legal details were invented.
9. Existing homepage contrast/touch-target accessibility findings need targeted design approval if broader visual changes are desired. Core client bundles still ship broad locale catalogs. Further route-specific catalog splitting would affect admin/client translation architecture and was not included in this targeted optimization.

Standards consulted: [Next.js 15 Metadata API](https://nextjs.org/docs/15/app/api-reference/functions/generate-metadata), [Google localized-page annotations](https://developers.google.com/search/docs/specialty/international/localized-versions), [LocalBusiness guidance](https://developers.google.com/search/docs/appearance/structured-data/local-business), [Schema HairSalon](https://schema.org/HairSalon), [robots/noindex distinction](https://developers.google.com/search/docs/crawling-indexing/robots/intro), [Core Web Vitals thresholds](https://web.dev/articles/vitals).

## Final results

All checks below ran successfully on the final source/build:

- `npx tsc --noEmit`, `npm run lint`, and standard `npm run build` (lint enabled). Three existing admin image warnings remain; no lint/type/build errors. Build ran in an isolated source copy to preserve the active development server's `.next` directory.
- SEO 6 groups; i18n 18; site-mode 10; localization audit 8; Google Reviews 16; WhatsApp provider 18; webhook 21; admin content 12. Total 109 synthetic test groups/assertion batches across eight suites; translation validation also passed.
- Production browser SEO suite passed all three modes, both languages, all four public pages and six widths. Private noindex, 307 locale redirect, 404 unknown page, normal/503 status behavior, sitemap, robots, accessible social asset and JSON-LD assertions passed. Privacy 320px document overflow is corrected.
- Desktop/mobile homepage screenshots visually inspected; existing design preserved. Initial idle frame requests decreased from seven to three. A read-only, unthrottled browser sample measured approximately 714 KB → 544 KB of initial mobile resource transfer, with zero observed CLS. These are individual local samples, not field statistics.

Final comparable Lighthouse runs were sequential, with no builds or other browser suites running concurrently. Lighthouse 13.6.0, Chrome 157, local production builds, German homepage; default simulated mobile throttling and desktop preset. Early exploratory runs overlapped other work and are excluded from the comparison below.

| Metric | Mobile before | Mobile after | Desktop before | Desktop after |
| --- | ---: | ---: | ---: | ---: |
| Performance score | 69 | 90 | 85 | 99 |
| SEO score | 100 | 100 | 100 | 100 |
| Accessibility score | 88 | 93 | 88 | 93 |
| Simulated LCP | 3.0 s | 3.6 s | 1.2 s | 0.8 s |
| Total blocking time | 1,320 ms | 30 ms | 300 ms | 0 ms |
| CLS | 0 | 0 | 0 | 0 |

The mobile LCP sample worsened and remains above 2.5 seconds, despite the performance score and blocking-time improvement. Do not interpret this as meeting all Core Web Vitals targets. The existing server-rendered data/streaming and cinematic poster loading path remain candidates for production tracing; no security-sensitive or cross-request caching was added to improve a synthetic score. No field INP or 75th-percentile data is available. Recheck against the actual deployed HTTPS origin and Search Console after an authorized deployment.

Skipped: isolated-database authorization/booking/POS mutation suites (no isolated test database, per user instruction), real account/appointment/payment creation, live notification tests, authenticated real-customer browser tests, production DNS/domain inspection, Google Search Console submission/verification, and external Rich Results validation. Mocked application tests do not prove PostgreSQL RLS enforcement. No commit or deployment was performed.


## Approved brand images — 24 November 2026

The supplied originals are now `public/brand/open-graph.webp` (1731×909, WebP) and `public/brand/profile.png` (1254×1254, PNG). Neither original was altered or regenerated. `socialMetadata()` now uses the actual wide artwork and `summary_large_image`, with absolute URLs derived from the existing `getSiteUrl()` / `NEXT_PUBLIC_SITE_URL` and `metadataBase`. Existing localized titles/descriptions, canonical/hreflang URLs and indexing rules are unchanged. Both site-mode pages already share this utility, so they inherit the same OG/Twitter image. The older logo remains in the existing visible UI and business schema; it no longer overrides social metadata.

The root Metadata API declares one multi-resolution `/favicon.ico` (16/32/48), PNG icons at `/icons/favicon-16x16.png`, `/icons/favicon-32x32.png` and `/icons/favicon-192x192.png`, and one `/apple-touch-icon.png` at 180×180. These are optimized, aspect-preserving resizes of the complete original profile image, with no cropping, recoloring, or new artwork. No manifest or file-based Next icon override existed, and no new PWA manifest was introduced. Existing middleware exclusions already allow PNG/WebP files and favicon.ico in all modes; authentication and middleware did not need changes.

Regenerate only the derived icons with `node scripts/generate-brand-icons.cjs`. Check the real binary sizes/formats and ICO entries with `node scripts/test-brand-assets.cjs`. `npm run test:seo` checks metadata policy, and the existing production browser suite additionally checks actual rendered/crawler metadata, unique OG/Twitter tags, distinct icon declarations, Apple icon size, and HTTP status/content types for every asset in both languages and all modes.

The standard production build passed after clearing only its temporary build cache; the first attempts encountered an unrelated Next Google-font loader error. Font configuration, dependencies and application styles were not changed. TypeScript and ESLint passed, with three existing admin image lint warnings. The build was isolated from the running development server and used a temporary 4 GB Node heap. It used the production public origin `https://1200hairstudio.ch` for verification; no environment file or hosted variable was changed.

**Actual production check:** both `https://www.1200hairstudio.ch/brand/open-graph.webp` and `/brand/profile.png`, and the equivalent apex-domain URLs, returned **404** during this task. Local implementation is not a deployed update. Include both supplied originals and all generated icons in the next authorized deployment, then verify HTTP 200 and the correct image Content-Type on the live URLs before requesting a new Facebook/WhatsApp/LinkedIn preview scrape. Preview caches can retain an older image until the platforms fetch again. No hosted deployment or account configuration was changed.

Rendered Chrome metadata and image HTTP responses are verified locally in all modes. Native Chrome tab-bar visual inspection was unavailable because the desktop browser controller timed out. Real iPhone Safari Add to Home Screen behavior and live social-platform rendering have not been verified. The 180×180 Apple declaration and image bytes are tested; this is not a real-device claim. No booking, authentication, notification or database flow was changed by this brand integration.
