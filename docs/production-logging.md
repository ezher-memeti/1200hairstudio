# Production logging cleanup — 24 November 2026

Removed application debug output without changing queries, authentication, prices, booking/payment mutations, notification delivery, environment files or schemas. The existing `docs/analytics.md` edits belong to the preceding task. The pre-existing removal of the homepage aggregate timing log was preserved.

## Changes

- Removed homepage timing wrappers and unused timer, announcement timing/finally block, Supabase middleware console timing helper/calls and its logging-only auth-state calculation, and the promotion debug flag/helper/calls.
- Kept middleware `Server-Timing` diagnostics and cookie/session forwarding unchanged.
- Added `safeLogDetails` for explicit, bounded diagnostic fields. Fixed log labels, SQLSTATE/PostgREST codes, known network/OAuth codes, numeric HTTP status, standard error kinds, selected operational enums/flags, bounded attempt counts and internal UUID correlation references remain available. Customer/profile IDs, personal information, search input, booking references/tokens, provider message IDs, raw messages/details/hints/stacks, request headers/bodies, SDK configs and response bodies are excluded.
- Applied this sanitizer to previously raw operational console arguments in actions, server services, admin loaders, API handlers and the reminder job. Removed sensitive/unused log-only fields at call sites. Gmail's existing sanitized submission exception now also carries the numeric status for structured logging; submission and retry behavior are unchanged.
- The reminder worker deploys independently of Next.js, so its dependency-free sanitizer is included in `supabase/functions/_shared/logging.ts`. A regression test checks it matches the Next sanitizer exactly.
- Temporary financial-report HTTP errors and reminder-job top-level HTTP errors now return generic failure text rather than raw caught exceptions. Status codes and successful responses remain unchanged. This is not a redesign of intentional admin diagnostics or domain validation feedback.
- Existing WhatsApp/webhook and Google Reviews warnings already contain only fixed codes/numeric statuses and remain unchanged. Development-only Google OAuth endpoints retain their production-denial guards; OAuth callback errors no longer log provider exception messages.

## Remaining logging

There are **111 operational `console.error`/`console.warn` call sites** in application and reminder-worker sources, and **zero `console.log`/`console.debug`/`console.info` or `debugger` statements**. These are conditional failure paths, not normal request logs.

| Area | Reason retained |
| --- | --- |
| Authentication/account/OAuth | Account deletion failures, missing locale initialization, OAuth exchange/file failures; no credentials or codes |
| Bookings/customers/recurring/loyalty | Failed writes, credential verification flags, protected deletion, notification failures and settings failures |
| Gmail/receipts/reminders | Delivery/persistence failures, especially provider acceptance followed by log-update failure; internal correlation references permit investigation without resending |
| WhatsApp test endpoint/webhook | Sanitized provider/test persistence failures and webhook retryable persistence failures |
| Checkout/register/finance/reports | Failed financial operations and report/receipt generation; no payment payloads or raw database exceptions |
| Admin marketing/content/settings | Failed saves/loads and delivery persistence; no customer searches, recipient details or authored payloads |
| Google Reviews/public configuration | Upstream availability and configuration read failures; fixed codes/status only |

Explicit CLI validators, automated tests, read-only assessment utilities and intentional administrative diagnostics were retained. Their test/report output is not loaded into frontend bundles or called on ordinary production requests. Standard Next.js build/start warnings are tooling output, not application debug logging; they were not silenced globally.

## Verification

- `npm run lint`: passed with three pre-existing admin image warnings.
- `npx tsc --noEmit`: passed.
- Standard `npm run build`: initial attempt compiled but the validation worker exhausted its default 2 GB heap. `NODE_OPTIONS=--max-old-space-size=4096 npm run build` passed with lint/type validation enabled and all 37 static pages generated. The larger heap applied only to this local command; no environment file or hosted setting changed.
- `node scripts/test-production-logging.cjs`: six groups cover SDK/database credential/PII exclusion, retained diagnostics, malformed/circular errors, safe report API responses, safe reminder-job responses/logs, and a repository-wide AST audit of log call sites and development-only OAuth guards.
- Existing synthetic suites: email safety (9), WhatsApp (18), webhook (21), multilingual admin content (12), i18n including session-cookie forwarding and booking mocks (18), site modes (10), Google Reviews (16), SEO (6), localization audit (8), Analytics (17).
- All application/worker console call sites were searched again; `git diff --check` passed.
- Browser smoke verification: the isolated production build rendered `/de` and `/en` at 390px and 1440px with zero application console messages and zero uncaught JavaScript errors. The unchanged local configuration is `under_construction`, so each document correctly returned HTTP 503 and Chrome emitted its expected network-status error. One existing `/favicon.ico` HTTP 404 also appeared. These genuine browser network errors were reported, not suppressed or changed as part of debug-log cleanup.
- The running development server on port 3000 shares the repository `.next` directory, so an initial browser attempt encountered mixed client manifests. The final verification used a separate temporary source copy and successful production build to avoid disturbing that server. No project configuration changed.

No database-mutating or isolated-database tests were run, and mocked authorization checks are not proof of live RLS enforcement. No accounts, appointments, payments, real email/WhatsApp notifications, hosted settings, deployments or commits were created. Deno is not installed locally: worker behavior was tested by transpiling the actual entry point with mocked Supabase/network/environment dependencies, not by a hosted invocation.

## Files added or modified

Logging-only changes across multiple services are necessary because those existing error call sites previously logged raw objects. Other than the two explicit error-response changes and structured Gmail error status, business control flow is unchanged.

- `docs/production-logging.md`
- `scripts/test-email-safety.cjs`
- `scripts/test-production-logging.cjs`
- `src/app/account/actions.ts`
- `src/app/actions/appointments.ts`
- `src/app/actions/checkout.ts`
- `src/app/actions/customers.ts`
- `src/app/actions/finance-overview.ts`
- `src/app/actions/finance.ts`
- `src/app/actions/financial-reports.ts`
- `src/app/actions/homepage-user-state.ts`
- `src/app/actions/register.ts`
- `src/app/actions/sales.ts`
- `src/app/admin/(dashboard)/customers/emails/page.tsx`
- `src/app/admin/(dashboard)/marketing/actions.ts`
- `src/app/admin/(dashboard)/marketing/promotions-actions.ts`
- `src/app/admin/(dashboard)/site-settings/announcements/actions.ts`
- `src/app/admin/(dashboard)/site-settings/announcements/page.tsx`
- `src/app/admin/(dashboard)/site-settings/contact/actions.ts`
- `src/app/admin/(dashboard)/site-settings/contact/page.tsx`
- `src/app/admin/(dashboard)/site-settings/homepage-content/actions.ts`
- `src/app/api/admin/end-of-day/route.ts`
- `src/app/api/admin/financial-reports/temporary/route.ts`
- `src/app/api/google/callback/route.ts`
- `src/app/api/internal/appointment-reminder-email/route.ts`
- `src/app/page.tsx`
- `src/lib/admin/runtime-settings.ts`
- `src/lib/announcements/queries.ts`
- `src/lib/appointments/deletion-protection.ts`
- `src/lib/appointments/managed-mutations.ts`
- `src/lib/appointments/mutations.ts`
- `src/lib/contact-section/settings.ts`
- `src/lib/customers/email-logs.ts`
- `src/lib/customers/mutations.ts`
- `src/lib/email/gmail.ts`
- `src/lib/logging.ts`
- `src/lib/loyalty/settings.ts`
- `src/lib/promotions/server.ts`
- `src/lib/recurring-bookings/service.ts`
- `src/lib/register/server.ts`
- `src/lib/supabase/middleware.ts`
- `supabase/functions/_shared/logging.ts`
- `supabase/functions/process-appointment-reminders/index.ts`
