# Admin notification center

## Installed schema audit and migration tracking

A read-only OpenAPI inspection of the configured hosted Supabase project confirmed `public.admin_notifications` exists with all ten requested columns: UUID id/admin_user_id/event_id/entity_id, text kind/booking_source, timestamptz starts_at/created_at/read_at. The documented profile and push-event foreign keys are exposed. An anonymous zero-row request was rejected with HTTP 401. No customer rows were fetched or changed.

There was no inbox migration in this repository. Supabase Management API credentials are not available locally, so installed trigger bodies, indexes, FK delete actions, authenticated-role grants and migration-history status could **not** be independently inspected. Do not infer that a table's existence means the new migration is already applied.

`supabase/migrations/202611250002_admin_notification_inbox.sql` now tracks this schema. Apply it through the normal reviewed migration process **before deploying the notification UI**, using the existing push schema as prerequisite. It runs in a transaction and is safe to replay against the prepared table: no history backfill/deletion, no push-table column changes, no new registration/booking event-generation path. It:

- Retains RLS and removes direct PUBLIC/anon/authenticated grants; service-role access is behind application authorization.
- Adds per-admin pagination/unread indexes and a unique admin/event index. Existing duplicate or incompatible rows cause failure rather than automatic deletion.
- Ensures the inbox event foreign key uses `ON DELETE SET NULL`, retaining entity fields and history after the existing push-event retention cleanup.
- Replaces only `admin_notification_event_created` on `admin_push_events` and its matching inbox function. It does not add a second listener. Insertion is idempotent and catches failures with SQLSTATE-only warnings, preserving registration/booking success.

Before applying/repairing migration history, a trusted database administrator can inspect schema-only metadata:

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema='public' and table_name='admin_notifications'
order by ordinal_position;
select relrowsecurity from pg_class where oid='public.admin_notifications'::regclass;
select indexdef from pg_indexes where schemaname='public' and tablename='admin_notifications';
select conname, pg_get_constraintdef(oid)
from pg_constraint where conrelid='public.admin_notifications'::regclass;
select tgname, pg_get_triggerdef(oid), pg_get_functiondef(tgfoid)
from pg_trigger where tgrelid='public.admin_push_events'::regclass and not tgisinternal;
select grantee, privilege_type from information_schema.role_table_grants
where table_schema='public' and table_name='admin_notifications';
select version from supabase_migrations.schema_migrations where version='202611250002';
```

If the reviewed migration has already been executed manually and the complete resulting schema/function/trigger match, the operator may record it using `supabase migration repair 202611250002 --status applied --linked`. Otherwise apply the migration normally; **do not mark it applied based only on this report**. No hosted SQL or migration-history changes were executed here.

## Behavior and event ownership

The inbox consumes existing `admin_push_events` only. Confirmed registrations, confirmed appointments and completed transitions create one row per current admin; test events are excluded. The unique admin/event index and existing stable event keys prevent repeated callbacks from creating duplicate notifications. Inbox creation does not require a device subscription or enabled push preferences. Admin-created bookings are included as actual studio activity; their separate optional push preference remains unchanged. There is no scheduler, polling loop, new provider, new push table or customer-facing send.

Bell counts refresh on route/query navigation, opening the modal, returning to the tab, and read-state changes. The modal uses a native dialog for keyboard focus trapping/Escape, focus restoration, dark theme, bounded scroll area, mobile bottom-sheet sizing and safe-area spacing. Requests are event-driven; overlapping count requests are coalesced. List request generations ignore stale responses after filter changes/closure. Read changes are optimistic, serialized and rolled back on failure, then reconcile the independent count. Unread state is per admin and does not change `admin_push_deliveries.status`.

## API

All operations verify the current session and current profile role; all database statements explicitly filter `admin_user_id` using that verified user. Service-role credentials remain server-only; APIs never accept an admin-user ID.

- `GET /api/admin/notifications?filter=all|unread&cursor=...`: fixed page size 15, fetches 16 to detect another page. Ordered by `created_at DESC,id DESC`. Validated opaque cursor keeps the original PostgreSQL timestamp precision and UUID; no offset pagination or unbounded history response.
- `GET /api/admin/notifications/count`: separate exact unread count using a head-only query and unread index.
- `PATCH /api/admin/notifications/[id]`: `{ "read": true|false }`, ownership scoped, 404 for missing/other-owner rows.
- `POST /api/admin/notifications/read-all`: `{}`, updates only this admin's unread rows up to server request time, returns no unbounded row array.
- `POST /api/admin/notifications/[id]/open`: `{}`, ownership-scoped lookup, resolve current entity, mark read, return a fixed internal destination and missing flag.

Mutations require same-origin JSON, `x-admin-notifications: 1`, bounded 1KB bodies, and reject cross-site requests. UUIDs/filter/cursors are validated; cursor timestamp/UUID values cannot inject PostgREST filter expressions. Responses use `private,no-store`; errors/logs contain no raw database details or personal information.

## Exact navigation

- Customer events use existing event semantics (`entity_id` is the registration profile UUID), resolve `customers.profile_id`, and open `/admin/customers?customerId=<resolved customer UUID>`. The existing customer component opens that exact record, including when navigating from another customer's details on the same mounted page.
- Appointment events query the current appointment by `entity_id`, not the snapshot time. They open `/admin/appointments?view=day&date=<current Zurich day>&appointmentId=<UUID>&notification=<inbox UUID>`. The existing day timeline scrolls to the appointment and opens/focuses the existing detail panel. Choosing Day gives a deterministic destination regardless of the originating calendar view. A rescheduled appointment therefore opens its current date/time.
- Historical appointments reached from the inbox show the existing read-only indicator and hide notes/scheduling edit/status/removal controls in that detail panel. Financial/receipt functionality and unrelated administrative workflows remain intact. The existing past-day Calendar modal rules are untouched.
- Missing/deleted entities open the appropriate list with a localized notice. Resolver failures leave the inbox open with a retryable error. Navigation is based on retained inbox entity fields, even after `event_id` becomes null.
- Existing `/admin/push/[eventId]`, iPhone tap login redirects, VAPID identity, permission UI, subscriptions, delivery worker and pg_net SQL are unchanged.

## Files

- Database: `supabase/migrations/202611250002_admin_notification_inbox.sql`.
- Server/types/presentation: `src/lib/notifications/{server,types,presentation}.ts`.
- API: `src/app/api/admin/notifications/route.ts`, `count/route.ts`, `read-all/route.ts`, `[id]/route.ts`, `[id]/open/route.ts`.
- UI: `src/components/admin/notifications/NotificationCenter.tsx`, `NotificationCenter.module.css`, `AdminShell.tsx`, targeted appointment/customer deep-link support in `AdminAppointmentsView.tsx` and `AdminCustomersView.tsx`.
- Translation and tests: `messages/en.json`, `messages/de.json`, `scripts/test-admin-notifications*.cjs`, `scripts/test-admin-notification-targets-browser.cjs`, the production push regression script, package test command and this guide.

## Safe verification

- `npm run test:admin-notifications`: mocked server/API/query tests, no database or provider requests.
- `PGLITE_MODULE=/absolute/test-tools/node_modules/@electric-sql/pglite node scripts/test-admin-notifications-db.cjs`: actual migrations in fresh in-memory PostgreSQL with synthetic schemas/roles. Covers event uniqueness, no-device/push-disabled independence, registration/booking/completion, test exclusion, per-admin state, event retention, cursor arrivals, replay, grants and nonblocking trigger failures. This is not evidence of deployed database RLS enforcement.
- `ESBUILD_MODULE_PATH=... PLAYWRIGHT_MODULE_PATH=... node scripts/test-admin-notifications-browser.cjs`: real Chromium, real notification component, synthetic APIs. Tests bounded pages, optimistic changes/rollback, empty filters, keyboard/focus/scroll lock, missing entity navigation, EN/DE and mobile/tablet/desktop sizing. Use `INBOX_CSS_ROOT` to point at the isolated production build's `.next/static/css` for final visual checking.
- `scripts/test-admin-notification-targets-browser.cjs` uses real existing appointment/customer components with synthetic actions: verifies the selected appointment UUID, time-slot scroll, focused details in Day/Week/List, read-only historical inbox details, and mounted-page customer UUID switching in both languages.
- Existing push/SQL/permission browser tests remain applicable. No actual iPhone delivery was attempted or claimed; working deployed push code is unchanged.
- TypeScript, ESLint, translation validator and standard production build are run separately. Automated verification uses fake build credentials/isolated data, never production mutations, real notifications or OS permission requests.

Deployment is manual. No new environment variables, providers, scheduler or dashboard configuration are required beyond reviewing/applying the inbox reconciliation migration and deploying the code when authorized.

## Verification results

- `npx tsc --noEmit`: passed. `npm run lint`: passed with the three existing next/image warnings; no new warnings or disabled rules.
- `npm run build`: standard production build passed in an isolated repository copy using fake Supabase configuration and loopback backend URL. No production records were accessed by the build.
- Notification API/presentation tests and actual migration tests in isolated PostgreSQL: passed.
- Real Chromium modal tests with production-built CSS: passed in EN/DE at 320, 390, 768 and 1440px; mobile and desktop screenshots inspected. Read/unread/all, pagination, rollback, modal reopening, focus/Escape, background scroll lock and missing-target fallback passed.
- Existing appointment/customer component browser tests: passed in EN/DE; exact appointment UUID opens and focuses the existing detail panel and scrolls the actual timeline item in Day/Week/List, historical inbox view hides scheduling actions, and customer details switch by UUID on a mounted page. Reschedule/current-date and retained/deleted-target resolution are separately covered by mocked API tests.
- Existing Web Push provider, isolated queue SQL, permission/settings browser tests, site modes, admin content, Calendar history and production logging tests: passed.
- Actual isolated production-server checks in live/coming_soon/under_construction: passed for manifest/worker/icon availability, one worker registration, preserved push tap/login behavior, and unauthenticated rejection by inbox list/count/read-all endpoints. These checks use synthetic configuration, not deployed data.
- Translation validator: passed for matching EN/DE keys, placeholders and Swiss spelling.
- Not performed: hosted migration execution or migration-history repair, authenticated hosted-table permission tests, production customer/appointment mutations, real notifications or physical iPhone verification. Existing deployed iPhone delivery is preserved by leaving push transport, worker, pg_net and VAPID implementation unchanged, not by sending a live test.
