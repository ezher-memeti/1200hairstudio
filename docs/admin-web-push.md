# Admin Web Push

## What changed

The repository had no manifest or service worker; an existing iPhone installation may be a Home Screen shortcut. There is now one root manifest and `/sw.js`, with no fetch handler, offline caching, session caching or forced activation. Other worker scripts are detected and enrollment refuses to replace them. Existing Gmail, WhatsApp and appointment sending paths are untouched.

Push preferences live in the existing `admin_settings.notifications.push` JSONB object. New registrations and customer bookings default on; completed appointments and admin-created bookings default off. Device enrollment is independent of these preferences. Both `/admin/settings` (Notifications tab) and `/admin/site-settings/notifications` use the same settings implementation.

## Rollout — not applied automatically

1. Review and apply `supabase/migrations/202611250001_admin_web_push.sql` through the normal migration process. It adds only dedicated push tables/functions/triggers, with RLS enabled and no browser grants. Existing RLS policies and outbox constraints remain untouched. Back up/review as usual; this file has only been exercised against isolated synthetic PostgreSQL.
2. A VAPID pair was generated privately at `~/.1200hairstudio/admin-push-vapid.json` (mode 0600), outside Git. Copy its values using a local editor, never into chat/logs. Preserve this pair securely across deployments; changing it invalidates existing enrollments. To create a genuinely new identity elsewhere: `node scripts/generate-vapid-keys.cjs /absolute/private/path/new-vapid.json`. The command refuses an existing file and never prints keys. Do not regenerate an existing identity.
3. Configure Vercel environment variables, without changing existing values:
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`: generated publicKey (public, build-time).
   - `VAPID_PRIVATE_KEY`: matching privateKey, server only.
   - `VAPID_SUBJECT`: a valid owner contact URI, e.g. `mailto:owner@example.com` (replace appropriately).
   - `ADMIN_PUSH_JOB_SECRET`: independent random bearer secret, at least 32 characters; use a password manager.
   - Existing server-only Supabase service-role configuration must already work. Never prefix private/service-role credentials with `NEXT_PUBLIC_`.
4. Deploy only after explicit authorization. Build-time public-key changes require a rebuild. Separate databases/identities are recommended for Preview; never point automated test runs at production.
5. Enable only Supabase `pg_net` and Vault. In Vault store `admin_push_url` as `https://1200hairstudio.ch/api/internal/admin-push` and `admin_push_job_secret` matching Vercel's existing `ADMIN_PUSH_JOB_SECRET`. Review and manually apply the **entire** `supabase/admin-push-scheduler.sql` file (its historical filename is retained). It installs only the asynchronous, post-commit delivery-insert wake-up. It also unschedules the old `1200-admin-push` job if it exists, without requiring pg_cron or changing other jobs. The file is safe to reapply; do not reapply the initial table migration if already installed.
6. Check pg_net HTTP responses and delivery records using trusted administrative SQL. Each insert statement into `admin_push_deliveries` invokes the secure endpoint through pg_net after commit. The application does not wait for HTTP or Web Push delivery. The endpoint returns counts only; `SENT` means accepted by the provider, not confirmed display. Each call handles at most eight deliveries in parallel, with an eight-second provider timeout.

**No recurring infrastructure is required:** do not enable pg_cron, create a cron job, configure Vercel Cron or add browser/server polling. Keep pg_cron installed if other features use it; only the named legacy push job is removed. Keep all existing VAPID keys, service-role configuration and the endpoint bearer secret unchanged. Restrict access to Vault and pg_net request tables because the trusted HTTP queue necessarily contains Authorization headers. Preview requires deliberate changes to the exact URL allowlist and isolated secrets; never direct a production wake-up to Preview.

The wake-up uses [Supabase pg_net](https://supabase.com/docs/guides/database/extensions/pg_net), whose asynchronous HTTP requests start after commit. A rollback removes both the event and queued request. Failed enqueue attempts are caught with sanitized warnings and do not abort registration or appointment persistence.

**Event-driven delivery is best effort.** There is no timed retry or backlog drain. A failed or missed wake-up can leave `PENDING` deliveries; HTTP 429/5xx can leave `RETRY` deliveries until another event invokes the endpoint after their backoff expires. Each invocation is bounded to eight deliveries, so a larger batch may remain pending. A later event or an intentional authenticated operator invocation may process eligible records, but automatic retries are not guaranteed. Inspect retained delivery statuses/error codes for diagnostics; do not automatically resend `UNKNOWN` deliveries. Retention/expired-lease maintenance runs only when the endpoint is invoked, so cleanup can also be delayed during inactivity.

## Security and lifecycle

- All subscription/test endpoints authenticate the session and current admin role, require same-origin JSON mutations and a custom header, and derive ownership server-side. Test requests target only the signed-in admin's own active device, with an atomic database limit of one per minute per device.
- Subscription endpoints/encryption keys never appear in API responses or logs. Provider endpoints are restricted to known browser push-service hosts to prevent SSRF. VAPID key pairs and contact are validated before claiming work.
- Registration triggers cover profile creation and email confirmation; only confirmed `customer` accounts enqueue once. Existing guest-to-registered account linking does not depend on a new customer row. Logins/profile updates do not enqueue. Worker checks exclude recipients who lost admin rights and registrations whose profile is no longer a customer.
- Appointment triggers cover every persisted creation path, emit on confirmation/completion transitions, and use stable kind+appointment event keys. Transaction rollback removes the event and deliveries. A repeat confirmation/completion does not resend the same event. Existing app status/finance logic is unchanged.
- Trigger enqueue failures are caught with SQLSTATE-only warnings, preserving booking/registration availability. Such an enqueue failure can lose an alert: investigate warnings rather than promising guaranteed delivery.
- Claim leases, unique event/device pairs and matching claim tokens prevent concurrent/repeated processing. HTTP 429/5xx remain eligible for bounded exponential retries (maximum five attempts, 24-hour event lifetime), but only a subsequent invocation can process them; no scheduler guarantees a retry. 404/410 deactivate the device. Ambiguous network failures and expired processing leases become `UNKNOWN` and are **not** retried automatically, preferring no duplicate over possible lost delivery. Exactly-once device delivery cannot be guaranteed across network failures. Stable notification tags replace an existing displayed event with `renotify:false`.
- Event preferences are checked both on enqueue and before sending. Disabling prevents pending delivery; re-enabling does not backfill old events. Changes while a send is already in flight cannot retract it. Inactive subscriptions/events have 30-day retention, cleaned when delivery processing next runs; there is no recurring cleanup.
- Reopening the settings page reconciles an already permitted device and interface locale without prompting. Renewal never stores sessions in the worker. Explicit disable unsubscribes only this device. Admin logout attempts deactivation and browser unsubscription; offline failure may defer cleanup until provider expiration. Notifications already queued to a provider cannot be recalled. Logging out does not make notification click destinations public.
- Lock-screen data is generic event text, Zurich time where available, and an opaque event UUID. No customer names, contacts, notes or appointment IDs are transmitted. Clicks resolve the private destination only after current admin authorization. Logged-out taps use the existing admin login with a validated UUID intent, not an arbitrary redirect URL. Deleted targets fall back to the admin dashboard.
- All three site modes retain protected admin routes, job/subscription APIs and public manifest/worker resources. Customer booking mode restrictions remain unchanged.

## iPhone activation and manual acceptance test

On iOS/iPadOS 16.4+ use Safari → Share → Add to Home Screen, open that installed app, sign in as admin, open Site Settings → Notifications, and tap Enable Push Notifications. Accept the operating-system prompt. If blocked, change device/browser notification settings; the page will not repeatedly prompt. If an old shortcut does not open standalone, reinstall from the updated website after rollout. Preserve the same origin and manifest identity for future updates.

Tap Send Test Notification **once** from each own device. Check delivery while open, then closed/locked, and tap the notification to verify authenticated routing. Test English/German interface language independently of content-editing language. Enroll a second device; disabling one must leave the other active. Save preference changes using the existing Save Changes button. With an isolated test database, verify confirmed/guest/admin bookings, completed bookings (opt in), and verified customer registrations. Never create production customers/bookings just for testing.

[WebKit requires a Home Screen app and a direct user gesture for permission](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/). Delivery is handled by the system push service while the PWA is closed; network, Focus settings and OS policy can delay or suppress display. No real iPhone, real push endpoint, production migration, live pg_net wake-up or closed-app delivery has been tested here.

## Changed file inventory

- PWA: `src/app/manifest.ts`, `public/sw.js`, `public/icons/app-512x512.png`, `src/app/layout.tsx`, `src/lib/seo/metadata.ts`, `src/middleware.ts`, `next.config.mjs`, `scripts/generate-brand-icons.cjs`.
- Push: `src/lib/push/{preferences,provider,worker,api,client}.ts`, `src/app/api/admin/push/{subscriptions,test}/route.ts`, `src/app/api/internal/admin-push/route.ts`, `src/app/admin/push/[eventId]/page.tsx`.
- Admin integration: `src/components/admin/push/PushNotifications.tsx`, `AdminSettingsView.tsx`, `SiteSettingsNav.tsx`, `LogoutButton.tsx`, `LoginForm.tsx`, `AdminCustomersView.tsx`, `src/lib/admin/settings.ts`, `src/app/admin/login/page.tsx`, dashboard customers page and site-settings notifications page. Login accepts only a validated opaque push-event intent; customer detail initialization changes no customer records.
- Configuration/translations/tests: `.env.example`, `package.json`, `package-lock.json`, `messages/en.json`, `messages/de.json`, `scripts/generate-vapid-keys.cjs`, `scripts/test-admin-push*.cjs`, `scripts/test-site-mode.cjs`. Runtime dependency: `web-push`; development types: `@types/web-push`.
- Database/operator instructions: the migration, event-driven wake-up SQL (historical scheduler filename) and this document. Earlier unrelated uncommitted work is retained.

## Automated checks

- `node scripts/test-admin-push.cjs`: mocked provider and API, authorization/CSRF, configuration, ownership, sanitized failure classification, payload languages/timezone and service-worker navigation.
- `node scripts/test-admin-push-db.cjs`: requires `@electric-sql/pglite` in an external test-tools directory (e.g. `npm install --prefix /tmp/1200-push-tools --no-save @electric-sql/pglite`); pass `PGLITE_MODULE=/absolute/path/to/node_modules/@electric-sql/pglite`. It runs the actual migration against a fresh in-memory PostgreSQL instance using synthetic roles/tables; no Supabase project or credentials. This is not proof of deployed Supabase RLS enforcement.
- `node scripts/test-admin-push-browser.cjs`: optional external esbuild/Playwright dependencies using `ESBUILD_MODULE_PATH` and `PLAYWRIGHT_MODULE_PATH`; uses synthetic browser Push APIs, no network sends or OS permission requests.
- `PUSH_BUILD_DIR=/absolute/isolated/build node scripts/test-admin-push-production.cjs`: optional Playwright audit of the real production server in all three modes, synthetic read-only backend on port 3999, worker/manifest/icon requests and protected click routing. Build it with only fake Supabase credentials and `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:3999`; never point this test at a live deployment.
- Normal `npm run lint`, `npx tsc --noEmit`, `npm run build` and existing regression suites.

## Verification performed

- TypeScript (`npx tsc --noEmit`): passed.
- ESLint: passed with the three existing `next/image` warnings in SelectedWorkManager and SiteSettingsServicesManager; no rules disabled.
- Standard production build (`npm run build`, including lint): passed in an isolated copy with fake credentials and a loopback-only Supabase URL. Expected existing settings-loader warnings occur because the build has no real database access.
- Provider/API/worker payload/notification relay/job authentication and service-worker tests: passed with mocked services; encryption request construction also checked without HTTP delivery.
- Actual migration and event-driven wake-up SQL: passed in isolated in-memory PostgreSQL with synthetic schemas/roles and stubbed Vault/pg_net, plus optional legacy-cron cleanup; ownership, permissions, transactions, preferences, claims, rate limits, retries and expired devices covered. No hosted RLS or live pg_net execution claim is implied.
- Real Chrome with synthetic browser Push APIs: passed in EN/DE at 320/390/768/1440px, including explicit permission, denied permission, renewal after reopening, own-device test and unsubscribe. Mobile and desktop screenshots were inspected. iPhone installation guidance was checked through emulation only.
- Actual isolated Next.js production server: passed in live, coming_soon and under_construction; manifest, icons and SW HTTP 200, one root worker, capability metadata and localized login intent for protected notification taps. The harness blocks navigation to the production origin. No permission prompt or push send occurs in this check.
- Existing analytics, password recovery, admin content, site-mode, WhatsApp provider/webhook, translation and production-logging regression tests: passed.
- Not performed: hosted migration/application, production environment changes/deployment, live push provider sends, actual iPhone/Safari closed-app notification delivery, production customer/appointment mutations.
