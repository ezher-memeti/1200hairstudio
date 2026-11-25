# Registration and recovery validation

## Changes

Registration and forgot-password forms now submit through `POST /api/auth/register` and `POST /api/auth/forgot-password`. These are form operations, not email-lookup endpoints. Both normalize email with trim/lowercase, validate input and same-origin JSON/custom-header requirements, apply shared rate limits, and then use the existing server-only service-role client to call a restricted Auth-account lookup.

`auth_form_account_exists` checks `auth.users.email` directly, including unconfirmed accounts and excluding soft-deleted users. Customers/profiles and unbounded `auth.admin.listUsers()` scans are not used as account-existence proxies. Anonymous/authenticated roles cannot call this RPC or access limiter rows. No passwords, addresses, IPs, account IDs, provider payloads or tokens are included in logs/API error bodies.

- Existing registration: prevent the signup call, emit exactly `[AUTH] Registration attempt: Account already exists`, and show the requested message plus existing localized login/reset links. Known provider duplicate errors and obfuscated empty-identity responses also map to this result to handle a concurrent signup. Supabase's unique-account enforcement and the existing profile trigger remain the final duplicate protection; a preflight lookup is not an atomic transaction with GoTrue.
- New registration: call normal Supabase `signUp()` through the existing SSR client, with the same full-name/phone/marketing-consent/locale metadata and localized `/login` confirmation redirect. No `auth.admin.createUser`, auto-confirmation, manual profile inserts or customer-logic changes. Existing session behavior is preserved via SSR cookies and a token-free `hasSession` response.
- Existing recovery: call the existing `resetPasswordForEmail` method. Only an error-free accepted result emits `[AUTH] Password reset: Email is sent`. This exact requested audit label means **Supabase accepted the request**, not verified SMTP/inbox delivery. Rejected/thrown provider requests produce sanitized warnings and never the sent event.
- Missing recovery account: skip both SSR recovery initialization and sending, emit `[AUTH] Password reset: Account not found` and return the same HTTP 200 `{ "success": true }` as an accepted request. The UI always shows the requested neutral message. Provider rejection/rate-limit/transport exceptions are also masked with that same response to avoid disclosing existence through error differences. Operators diagnose failures through the warnings; the UI does not confirm actual delivery.
- Invalid input fails before account lookup or sending. Storage/lookup failures fail closed with a sanitized generic error; no account or email is created/sent as a fallback.

The three fixed `console.info` messages are intentional production Auth audit records. The existing logging regression permits only those exact labels in this module; all other info/debug logs remain prohibited. Error/warn arguments still pass through the existing sanitizer.

## Security and limitations

The explicit duplicate-registration message intentionally reveals account existence to someone who submits a valid registration form. It cannot simultaneously provide complete registration enumeration resistance. There is no separate lookup-only endpoint; same-origin checks, strict input validation, shared per-email/client/global limits and existing Supabase-native protections reduce automated abuse. Recovery responses do not expose an existence flag, use identical accepted/missing/provider-error status and body, and the same UI message; timing can still differ because only existing accounts make an SMTP-producing request. Do not treat neutral text or rate limits as a proof of resistance to every timing attack.

The database budget is applied before lookup, across Vercel instances, per operation in a fixed 15-minute window:

- 3 attempts per normalized email across clients.
- 10 attempts per trusted client IP across emails.
- 100 attempts globally across clients/emails.

Only Vercel-deployed requests (`VERCEL=1`) trust the edge-overwritten `x-forwarded-for` IP. Invalid/multi-value/missing IPs and local/untrusted hosting share a conservative client bucket. Arbitrary local forwarded headers cannot rotate that bucket. Behind an additional proxy, verify Vercel's trusted-proxy configuration rather than trusting user-supplied headers. See [Vercel request-header guarantees](https://vercel.com/docs/headers/request-headers).

Limiter identifiers are purpose-separated HMAC-SHA256 digests using the existing server-only service-role secret. Raw emails/IPs are not stored. Rotation of that existing secret naturally resets digest identities; this feature never rotates it. Expired buckets are removed opportunistically in bounded batches, with no scheduler or external service. App limits do not replace or disable Supabase's own Auth rate limits; clients can still reach Supabase's public Auth endpoints directly. Keep provider-side abuse controls enabled.

## PKCE and redirects

The existing `@supabase/ssr` server client writes the signup/recovery verifier into response cookies; the existing browser client consumes that same cookie and processes the recovery code on `/en/reset-password` or `/de/reset-password`. There is no second callback or token-exchange workaround. The existing recovery observer, password form/updateUser, templates, SMTP and middleware are unchanged. [Supabase SSR uses cookie-backed PKCE for these methods](https://supabase.com/docs/guides/auth/server-side/advanced-guide).

Production redirects still use the existing canonical helper and `https://1200hairstudio.ch`. Same-origin checks use the browser/edge Host with the request protocol, rather than assuming Next.js’s internal hostname equals the public hostname; forwarded-host headers are not trusted. Development uses the initiating local request origin, preserving the PKCE verifier even if a local site-URL setting points to production. Preview uses the existing validated preview configuration; configure its site URL to the exact initiating deployment origin for same-origin cookies. Locale is validated to `en|de`; arbitrary return URLs are never accepted.

Hosted Supabase configuration is unchanged: Site URL should remain `https://1200hairstudio.ch`, with exact `/en/login`, `/de/login`, `/en/reset-password` and `/de/reset-password` entries on the redirect allowlist (plus intentionally supported local/preview URLs). Recovery HTML continues using `{{ .ConfirmationURL }}`.

## Required rollout

Review/apply `supabase/migrations/202611250003_auth_form_validation.sql` through the normal migration process before deploying these routes. It adds one private rate-limit table and three restricted functions, without modifying existing account/profile/customer tables or their triggers/RLS. It requires the existing Supabase Auth schema, including `auth.users.deleted_at`. No hosted migration or production account changes were executed by this task.

The application needs its existing `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` and publishable key. No new credentials or environment variables are introduced. Missing/unapplied functions fail closed rather than falling back to an insecure public lookup or unlimited sending. Do not expose the service-role key through a `NEXT_PUBLIC_` variable. Deploy manually when authorized; no SMTP/template/dashboard changes are required beyond retaining the existing correct redirect configuration.

## Files and verification

- `src/lib/auth/form-handler.ts`, `form-client.ts`: guarded server submissions and thin browser caller.
- `src/lib/auth/shared.ts`: shared normalization and exact requested messages.
- `src/app/api/auth/{register,forgot-password}/route.ts`.
- `src/components/auth/PublicRegisterForm.tsx`, `PublicForgotPasswordForm.tsx`: server submissions, accessible localized status/errors, existing links and reset cooldown.
- `messages/en.json`, `messages/de.json`: exact English text and Swiss German translations.
- Migration above, package test script, `scripts/test-auth-form-validation.cjs`, `scripts/test-auth-form-validation-db.cjs`, expanded `scripts/test-password-recovery-browser.cjs`, narrow audit allowance in `scripts/test-production-logging.cjs`.

Tests use only synthetic accounts, an isolated PostgreSQL instance, mocked providers or a loopback fake Supabase API; no real customer registrations, password changes or emails are permitted:

- `npm run test:auth-forms`: new/existing/racing signup, normalized inputs, profile metadata/session response, known/unknown reset equality, accepted-only logs, provider errors, CSRF, private digests, rate-limit errors and locale/canonical/local redirect destinations.
- `PGLITE_MODULE=/absolute/test-tools/node_modules/@electric-sql/pglite node scripts/test-auth-form-validation-db.cjs`: actual SQL checks against synthetic `auth.users`, private grants, unconfirmed/deleted users, shared email/IP/global budgets, independent operations and expiry cleanup. This is not a test of deployed Supabase RLS.
- `RECOVERY_BUILD_DIR=/absolute/isolated/build PLAYWRIGHT_MODULE_PATH=... node scripts/test-password-recovery-browser.cjs`: production build configured with fake keys and Supabase URL `http://127.0.0.1:3099`. Exercises both language forms in all three site modes, new/duplicate registration and links, known/unknown reset notifications, invalid-email validation, real SDK S256 cookie exchange, password confirmation/update, sign-out/login and expired/invalid/used recovery links. External browser navigation is blocked and all email/Auth responses are synthetic.
- Existing password-recovery, URL, localization, production-logging tests, TypeScript, ESLint and standard production build.

## Results

- New-email registration: passed mocked route and real Chrome/production-build submission against synthetic Auth, preserving metadata, email-confirmation redirect and no manually inserted profiles.
- Existing-email registration: passed normalized preflight and provider-race tests; 409/translated notice and login/reset links confirmed in Chrome, with no duplicate signup provider call. The existing profile trigger still uses `ON CONFLICT (id) DO NOTHING` and is unchanged.
- Existing-account recovery: passed accepted-only audit checks, canonical localized redirect, real SDK S256 verifier-cookie exchange, new-password form, mismatched-password rejection, successful mocked updateUser, and return to login.
- Missing-account recovery: passed identical HTTP/UI response checks with zero reset provider requests; accepted-email audit is absent. Provider rejection, rate-limit errors and thrown transport failures also produce no false sent audit.
- Invalid email: passed server validation and browser localized validation, without account lookup or reset calls.
- EN/DE and live/coming_soon/under_construction: all six synthetic production-browser flows passed, including invalid/expired/used recovery links. No real Auth accounts, passwords or emails changed.
- Isolated PostgreSQL migration, private grants, Auth-record truth and persistent budget tests: passed.
- TypeScript, ESLint, translation validator, production-logging, existing password-recovery/URL/localization/site-mode regressions: passed. ESLint retains only the three existing next/image warnings.
- Standard production build including lint: passed in an isolated copy with fake credentials and a loopback-only backend.
- Not executed: hosted migration application, production signup/reset/email tests or deployment. Complete the migration rollout before using the new routes on a live deployment.
