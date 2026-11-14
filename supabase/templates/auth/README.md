# 1200 Hairstudio — Supabase Auth emails

These are standalone HTML bodies for Supabase Auth's existing mail delivery. They are not React
components, Gmail API messages, or a new mail sender. Nothing in this directory uploads templates
or changes a hosted project. Live template changes require the owner's approval. Only signup
confirmation and password recovery templates are supported.

## Audit and supported flows

| Flow | Existing implementation | Template and status |
| --- | --- | --- |
| Signup confirmation | `PublicRegisterForm` calls `auth.signUp` and displays a check-email message when no session is returned. Signup does not supply `emailRedirectTo`. | `confirm-signup.html`, newly added. Supabase verifies the link, then uses its Site URL. The message tells the customer to sign in afterward, matching the current UI. |
| Password recovery | `PublicForgotPasswordForm` calls `auth.resetPasswordForEmail` with `getResetPasswordRedirectUrl()`. `PublicResetPasswordForm` handles recovery state, updates the password, signs out, and opens `/login?reset=success`. | `reset-password.html`, newly added. The required destination is `/reset-password` on the configured site origin. |
| Password login, customer and admin | Both use `auth.signInWithPassword`. | Login itself sends no email; no separate login template is needed. |
| Magic link / email OTP | No `signInWithOtp` or email OTP verification flow exists. The local SMS example is not an email-login implementation. | No unused template was added. |
| Invite user | No invitation or accept-invitation flow exists. | No unused template was added. |

The original repository had no local Auth email HTML; `supabase/config.toml` contained only a
commented invitation example. Existing branded transactional emails live in `src/lib/email/gmail.ts`,
`reminder.ts`, `receipt.ts`, and `recurring.ts`. Marketing HTML is in
`src/lib/marketing/email-template.ts`, with marketing template records handled separately. Their
content is not an Auth template and was not duplicated or modified. These bodies reuse their
charcoal surfaces, muted gold action, text wordmark, and business-footer design conventions.

A read-only query to the hosted project's public `/auth/v1/settings` during this audit reported
email enabled, signup enabled, and `mailer_autoconfirm: false` (email confirmation required).
Hosted template bodies, subjects, redirect allowlists, and SMTP configuration are not exposed by
that public endpoint. The later authenticated template inspection is documented below; the
original public-endpoint audit did not inspect or change those hosted settings.

## Approved hosted installation — 2026-11-07

After explicit owner approval, a Management API PATCH submitted only the two approved HTML
bodies and their two matching subjects. An independent GET confirmed both bodies match the
local source byte-for-byte and both subjects match the mapping. The initial before/after
comparison found changes only to those four fields and Supabase's two aggregate customization
flag maps (`mailer_subjects_custom_contents`, `mailer_templates_custom_contents`). No other
Auth configuration changed, including SMTP, security, redirects, and unrelated templates.
Only the original two template fields and subjects were backed up for rollback; credentials
were not written to the template backup.

Real signup and password-recovery requests were accepted for one disposable Gmail alias
forwarding to the owner's authorized inbox. No tokens or private links were logged. Inbox
verification is partial: the owner confirmed that the signup email arrived with the charcoal
background. The owner reports the recovery email arrived with the old design/plain reset link, so recovery rendering has failed verification; sender details remain unconfirmed. Auth logs recorded
HTTP 200 for both original requests, and the test user's recovery-send timestamp was populated.
One recovery retry was accepted and advanced that timestamp. A further read-only check of both
runtime template-fetch endpoints returned HTTP 200 and the exact approved local HTML. No template
parse/fetch errors were found in the inspected send-window logs. Template caching remains an
unconfirmed explanation. A further recovery test was accepted at 2026-11-07 21:52 UTC,
more than ten minutes after installation, and advanced the recovery-send timestamp. The owner confirmed that this newest message has the charcoal background, branding, and gold
RESET PASSWORD button. This result is consistent with template caching; no additional template
changes were made between the old-design messages and successful retest. These signals do not establish inbox delivery or rendering.
The disposable Auth user and associated customer/profile records were deleted using only
recorded test IDs and the exact test alias. Follow-up reads confirmed all three were absent.
No existing customer account or password was changed.

A separate existing hosted configuration issue was observed: Site URL and redirect allowlist
are both only `http://localhost:3000`. The application requests
`http://localhost:3000/reset-password`, which is not explicitly allowed. Thus live recovery
navigation is not verified and may fall back to the Site URL. These redirect/security settings
were not part of the approved template change and were left unchanged. Production origin and
recovery allowlist need a separately approved correction before claiming end-to-end readiness.

## Hosted installation audit — 2026-11-07

An authenticated, read-only Management API GET of the application's configured project confirmed
that both hosted templates still contain generic, unbranded HTML. Confirmation is 184 characters
with subject `Confirm your email address`; recovery is 254 characters with subject
`Reset your password`. Neither body matches the local source or contains the approved charcoal
palette. This is why actual Auth emails still use the default formatting despite working Gmail SMTP.
No hosted template was saved during the read-only audit; the subsequently approved installation is recorded above.

Both approved HTML files exist on disk, without visible fallback URLs. They are currently untracked
in Git, so `git status` reports `?? supabase/templates/`; ordinary `git diff` omits their contents.
The validator is also untracked and `supabase/config.toml` has an existing local modification.
No commit or staging operation has been performed.

The local `content_path` entries do not automatically synchronize files to hosted Supabase.
Do not run a broad `supabase config push`: the hosted and local security, redirect, and other
settings differ. Install only the two HTML bodies and their subjects using the Dashboard mapping
below, or an approved Management API PATCH containing only these four fields:

- `mailer_templates_confirmation_content`: the complete `confirm-signup.html` source.
- `mailer_subjects_confirmation`: `Confirm your email | 1200 Hairstudio`.
- `mailer_templates_recovery_content`: the complete `reset-password.html` source.
- `mailer_subjects_recovery`: `Reset your password | 1200 Hairstudio`.

After approval and saving, GET the Auth config again and compare both bodies byte-for-byte with
the local files and both subjects with the mapping. Preserve all other settings. Then send real
signup and recovery emails through the existing application to an authorized test inbox, confirm
the received dark design and button destinations, and complete the existing flows. API acceptance
alone does not confirm inbox delivery or rendering. Use a disposable signup account and do not
reset an existing customer's password. No real Auth mail was sent during this read-only audit.

## Files and Dashboard mapping

| Supabase template | Subject | HTML body | Readiness |
| --- | --- | --- | --- |
| Confirm sign up | `Confirm your email \| 1200 Hairstudio` | `confirm-signup.html` | Review for the existing signup flow. |
| Reset password | `Reset your password \| 1200 Hairstudio` | `reset-password.html` | Review after confirming the recovery redirect allowlist. |

After explicit approval, configure each selected template as follows:

1. Open the correct Supabase project. Save a backup of its current subject and HTML body.
2. Under **Authentication → Email → Templates** (labelled **Email Templates** in some Dashboard
   versions), select the flow listed above. Compare the existing content with this file first.
3. Set the subject to the exact text in the table. Paste the **entire matching HTML file**, not
   this README, generated preview HTML, or a React component. Use the literal `|` character in
   subjects; the backslash in this Markdown table only escapes the table separator.
4. Keep the Go template expressions intact. Preview with Supabase's editor, then save only the
   approved flows. Do not bulk-push Auth config or replace unrelated templates/settings.
5. Keep the project's existing Auth email delivery/SMTP configuration. Do not redirect these
   messages through the application's Gmail booking/reminder/receipt sender.
6. Test with an authorized disposable account in staging before approving a production change.
   Disable SMTP-provider link tracking for Auth messages if it rewrites the verification URLs.

Each HTML body has one CTA pointing to `{{ .ConfirmationURL }}` and no fallback URL section. Supabase
constructs this URL with its verification endpoint, token, flow type, and allowed redirect.
The footer uses `{{ .SiteURL }}`. Do not replace
the action with a bare `/reset-password`, invent an `/auth/confirm` route, or introduce a
`{{ .TokenHash }}` link: this application does not have a server OTP-confirmation endpoint.
See Supabase's [template variable reference](https://supabase.com/docs/guides/auth/auth-email-templates).

The expiry/single-use notice is retained without promising a specific lifetime. Local email OTP
expiry is 3600 seconds; hosted lifetime was not inspected. Supabase consumes verification tokens
on successful use. The recovery same-browser instruction is intentionally retained: the installed
`@supabase/ssr` client uses PKCE, and the initiating browser stores the verifier needed for the
code exchange. See [Supabase PKCE documentation](https://supabase.com/docs/guides/auth/sessions/pkce-flow).

## URLs and current application compatibility

- Set the hosted **Authentication → URL Configuration → Site URL** to the canonical HTTPS
  production origin, without a path or trailing slash. Signup currently relies on this setting.
- Allow the exact production URL `<production-origin>/reset-password` under Redirect URLs.
  The Vercel environment's `NEXT_PUBLIC_SITE_URL` must use the same origin, scheme, and hostname.
  Confirm these hosted/Vercel values manually; they were not inferred from `.env.local`.
- For a local/staging run, use one hostname consistently for the app, Site URL, and redirect.
  Allow its exact `/reset-password` URL, such as `http://localhost:3000/reset-password`.
  `localhost` and `127.0.0.1` do not share the browser's PKCE verifier cookies.
- The repository's current local config uses Site URL `http://127.0.0.1:3000` and only
  `https://127.0.0.1:3000` as an additional redirect, while `.env.local` currently uses
  `http://localhost:3000`. Thus the checked-in local allowlist does **not** include the recovery
  URL requested by the app. Correct the chosen local test environment's Site URL/allowlist before
  expecting a real local recovery link to arrive at the reset form. This change deliberately
  leaves those security-related settings untouched.
- No `/auth/callback` or `/auth/confirm` route exists. `createBrowserClient` from the installed
  `@supabase/ssr` package uses PKCE and URL-session detection. It exchanges the code automatically
  on client initialization when the initiating browser still has the corresponding verifier.
  The installed Auth client preserves recovery intent and emits `PASSWORD_RECOVERY`, which the
  reset form listens for. An explicit server exchange route is not required for this existing
  browser flow. The Google Gmail OAuth callback is unrelated and must not be used here.
- Open recovery links in the same browser where they were requested. A different browser,
  cleared cookies, or a consumed/expired link cannot complete this PKCE flow. The existing reset
  form rejects missing recovery state; the templates do not relax that check.

## Local configuration and preview

`supabase/config.toml` references only the two files under `auth.email.template.confirmation`
and `auth.email.template.recovery`, with matching subjects. Paths are relative to the project root,
as in Supabase's [local template configuration](https://supabase.com/docs/guides/local-development/customizing-email-templates).
These are content settings only: confirmation requirements, existing Auth security settings, tokens,
redirect allowlists, rate limits, RLS, registration logic, and SMTP settings were not altered.
In particular, local `enable_confirmations = false` was preserved; local signup will not emit a
confirmation email unless that setting is explicitly enabled in a disposable test environment.

Validate source files without contacting any external service:

```sh
node scripts/validate-auth-email-templates.mjs
node scripts/validate-auth-email-templates.mjs --preview-dir /tmp/1200-auth-email-previews
```

The second command substitutes only synthetic reserved-domain values for browser preview. Those
files contain no usable tokens and must **not** be pasted into Supabase. It is a fixture renderer,
not a replacement for Supabase's Go template engine. The `.html` source files are authoritative.

The layout uses presentation tables, inline base styles, web-safe fonts, a borderless 600px fluid container, a
legacy Outlook conditional wrapper, and a table-backed action button. Media queries only reduce
padding/heading size on phones; the inline-only layout also fits a narrow screen. No remote
images, web fonts, scripts, forms, tracking pixels, or unsubscribe/marketing controls are included.

## Design verification

Both templates use the website palette (`#0d0d0d`, `#171614`, ivory, and `#a8845b`),
centered branding, web-safe serif headings, uppercase gold action buttons, and the existing business footer.
The primary labels are **RESET PASSWORD** and **VERIFY EMAIL**. Explicit foreground and
background colors are paired throughout; no external assets, gradients, shadows, or rounded
cards are used.

The design revision passed 20 Chrome browser cases: both templates at 320, 375, 390, 600,
and 1024px in light and dark browser modes. Checks covered centered buttons with at least
44px height, text contrast of at least 4.5:1, no clipping or horizontal overflow, and the inline-only layout with the style block removed.
CTA links were clicked against an intercepted synthetic verification endpoint, which redirected
to the expected application destination (`/` for signup, `/reset-password` for recovery).
No real token was used and no real authentication request was sent. The updated validator
requires exactly one ConfirmationURL occurrence, in the CTA href, and rejects fallback sections.

Browser screenshots are visual previews, not proof of rendering in Gmail, Outlook, or Apple
Mail. Those clients can transform colors and CSS independently. Actual inbox rendering and
live confirmation/recovery remain rollout checks below. This revision changes only these two
HTML bodies, validator, and this documentation; SMTP, Auth flow code, and Supabase configuration are unchanged.

## Verification and rollout checklist

Local verification covers variable/link/config consistency, browser HTML rendering at 320, 375,
390, 430, and 600px, the inline-only fallback, and the existing signup/recovery UI with a synthetic
local Auth API. The recovery contract test checks the actual installed SDK's S256 challenge/verifier
exchange, recovery-ready form, password-update request, sign-out, and success redirect. The signup
contract test checks PKCE initiation and the confirmation-required notice. The synthetic API sends
no mail, creates no accounts, and does not establish correctness of the real GoTrue backend or
production delivery. Browser previews do not replace Outlook/Gmail/Apple Mail inbox tests.

The template validator, HTML nesting/TOML checks, synthetic browser flow checks, `npm run lint`,
`npx tsc --noEmit`, and the standard `npm run build` all passed. The build used an isolated copy
and a 4 GB Node heap, with ESLint and TypeScript checks enabled. Three preexisting non-blocking
image warnings remain. Hash checks confirmed the existing Auth, registration, Gmail/marketing,
and migration source files were unchanged, and all non-template Supabase configuration values
were preserved.

A local Supabase mail server was not started (the Docker daemon was not running), and no hosted
template was applied. Before live approval, use staging/local Supabase with Mailpit or an authorized
test inbox to complete these remaining checks:

1. Enable email confirmation only in the disposable test environment if needed. Register a new
   disposable account, inspect the actual rendered confirmation email, follow its action, and sign
   in with the configured password. Confirm the existing customer-registration behavior is intact.
2. Request recovery from `/forgot-password`. Confirm delivery and the exact redirect, follow the
   link in the initiating browser, choose a new password, and confirm the success login redirect.
   Sign in with the new password; check expired and already-used links fail safely.
3. Magic-link/OTP and invitation flows remain unsupported; do not enable them by uploading
   unused templates.

## Customer email addresses

Customers cannot edit email addresses through the application's account settings. The email input
is disabled, `updateCustomerAccount` reads only name and phone, and `update_my_customer_profile`
accepts only those two fields. Extra email fields in a forged form submission are not forwarded.
No application endpoint calls `auth.updateUser` with an email attribute. The customer-edit action
that accepts an email requires an authenticated admin role before any database write; customers
cannot invoke that administrative capability.

This describes application-level behavior, not a new hosted Supabase restriction. Supabase's
direct Auth API is governed by the project's existing hosted configuration; removing local
templates does not disable that separate API. Hosted security settings and database migrations
are unchanged, and no existing customer email address is modified by this update.

Keep copies of the original hosted subjects/bodies for rollback. There is no automatic upload,
deployment, SMTP transport change, or approval step embedded in the validation script.
