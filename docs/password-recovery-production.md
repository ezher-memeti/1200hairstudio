# Production recovery redirect diagnosis — 25 November 2026

## Exact confirmed root cause

The hosted URL Configuration was inspected read-only in the authenticated Supabase Dashboard
for the project configured by this application. Its saved values were:

- Site URL: `https://www.1200hairstudio.ch`.
- Redirect URLs (two total):
  - `https://www.1200hairstudio.ch/de/reset-password`
  - `https://www.1200hairstudio.ch/en/reset-password`

The canonical non-www reset URLs were absent. The dashboard explicitly describes Site URL as
its fallback when a redirect is not specified or does not match the allowlist. No field was
edited and no settings were saved during this inspection.

A production-browser test of the **deployed** forgot-password forms captured both requests
before they left the browser. They already specified the correct destinations:

- German: `https://1200hairstudio.ch/de/reset-password`.
- English: `https://1200hairstudio.ch/en/reset-password`.

Every recovery POST was fulfilled locally by the test and other mutation requests were blocked.
No real recovery email or production Auth mutation occurred. This establishes the actual
production request value, not just the local TypeScript implementation.

Those non-www destinations do not match the observed www-only allowlist. Supabase substitutes
its Site URL, losing `/en/reset-password` (or `/de/reset-password`) before the request reaches
Next.js. The remaining chain is:

1. Supabase's default redirect targets the www root with the PKCE code.
2. Vercel redirects www root to non-www root (read-only HTTP verification: 308).
3. Locale middleware adds the selected/saved locale (verified with an English locale cookie:
   root returns 307 to `/en`), retaining the query. The reported final URL is `/en` with a code.
4. The homepage is not a recovery callback/form, so the reset form is never mounted there.

The www-to-apex redirect itself does **not** remove a reset path. Correctly allowed reset URLs
keep their explicit path and locale. No homepage code-sniffing workaround or new callback is
needed. App code cannot repair an allowlist decision already made by hosted Supabase.

References: [Supabase exact redirect matching](https://supabase.com/kb/troubleshooting/why-am-i-being-redirected-to-the-wrong-url-when-using-auth-redirectto-option-_vqIeO),
[redirect configuration](https://supabase.com/docs/guides/auth/redirect-urls).

## Required manual Supabase correction

In **Authentication → URL Configuration**:

1. Set **Site URL** to `https://1200hairstudio.ch` and save it.
2. Add and save these **exact** Redirect URLs:
   - `https://1200hairstudio.ch/de/reset-password`
   - `https://1200hairstudio.ch/en/reset-password`
3. Keep other legitimate entries, including existing www reset entries if needed for older
   valid links. Do not substitute a broad wildcard or rely on the root Site URL as an allowlist
   entry for a different host/path.
4. The application's signup flow also requests localized login destinations. To preserve its
   intended post-confirmation page, verify/add:
   - `https://1200hairstudio.ch/de/login`
   - `https://1200hairstudio.ch/en/login`

In **Email Templates → Reset Password**, keep the CTA href as `{{ .ConfirmationURL }}`.
The checked-in approved template already does this and was not modified. Its `{{ .SiteURL }}`
footer is a business link, not the password-reset action. The hosted template body was not
reopened/changed during this task; the confirmed URL allowlist mismatch alone explains the
observed failure. Do not replace the CTA with SiteURL, RedirectTo alone, a bare reset URL,
or a new TokenHash callback.

Hosted configuration was **not changed** by this task. Local `supabase/config.toml` configures
the CLI development instance and does not save these hosted values.

## Existing application flow retained

- `PublicForgotPasswordForm` calls `resetPasswordForEmail` with
  `getResetPasswordRedirectUrl(locale)`.
- The shared production URL helper generates the canonical origin and selected locale; even
  a www-valued production site setting normalizes to the canonical domain in the workspace.
- `/de/reset-password` and `/en/reset-password` rewrite internally to the existing reset page
  with the locale header. A stale locale cookie does not override an explicit path prefix.
- `APP_SITE_MODE` exempts Auth routes in live, coming_soon and under_construction modes.
- The reset page has no login/account/admin redirect guard. Existing Supabase middleware
  refreshes sessions without taking recovery users away from that page.
- The installed `@supabase/ssr` browser client performs the automatic PKCE code/verifier exchange.
  `observePasswordRecovery` subscribes before session initialization and latches the verified
  PASSWORD_RECOVERY event. Do not exchange the code a second time or trust `?type=recovery`
  plus a regular signed-in session.
- Once verified, the existing new-password/confirm-password form appears. Matching/strength
  validation happens before `auth.updateUser({password})`. Success signs out and redirects to
  the same locale's `/login?reset=success`.
- Invalid/expired/used links show the existing EN/DE invalid-link message and localized
  request-another-email action. Callback/error parameters are removed from the URL after
  initialization. No provider errors, codes, tokens or cookies are printed by the application.

No functional authentication code, competing callback, database security rule, user preference,
password or production account was modified for this diagnosis. Existing uncommitted URL and
marketing work from earlier tasks was preserved.

## Rollout / deployment steps

1. Apply and verify the hosted URL Configuration correction above first. It does not require
   a Next.js redeployment; the deployed form already generates the correct redirectTo.
2. Confirm Vercel Production `NEXT_PUBLIC_SITE_URL=https://1200hairstudio.ch`. The deployed
   request interception verified its effective recovery destination, not private dashboard
   environment values. Keep the existing www-to-apex routing.
3. If rolling out the earlier uncommitted canonical-URL hardening or changing build-time public
   variables, review that revision and run the normal production deployment separately. This
   task did not commit or deploy; tests/docs alone do not require a production redeployment.
4. Discard old recovery emails and request a **new** link from the canonical `/de/forgot-password`
   or `/en/forgot-password` page after saving Supabase settings. Old emails retain their original
   redirect and may already be consumed. No safe app callback can reconstruct the lost purpose
   from arbitrary homepage codes without introducing the forbidden competing flow.
5. Open the new link in the initiating browser/profile on the same canonical origin so the PKCE
   verifier cookie is available. Do not change accounts/passwords solely as a URL test. Actual
   account testing must be a separate deliberate owner-authorized action.

## Verification and changed files

- `scripts/test-production-recovery-redirect.cjs` (new): deployed public forms in both languages,
  hydration-aware interaction, safe destination-only inspection, all Auth mutations intercepted
  or blocked. No mail sent. Earlier attempts before hydration captured no request; the final
  hydrated checks passed and showed the canonical localized paths.
- `scripts/test-password-recovery.cjs`: regression for the exact observed www-only allowlist,
  documented provider fallback modeled locally, canonical correction, opposite-language cookies,
  existing event race/error/session/open-redirect safeguards and mode exemptions.
- `scripts/test-password-recovery-browser.cjs`: actual installed SDK against synthetic Auth,
  now covering both languages in all three site modes, stale opposite-language cookies,
  signup/recovery destinations, valid/invalid/expired/used links, mismatched passwords,
  exactly one successful S256 exchange and update, sign-out and localized success login.
- `supabase/templates/auth/README.md`: current confirmed hosted diagnosis and manual correction.
- This report. No application Auth implementation or approved template HTML needed changing.

Synthetic tests do not prove that hosted configuration has been corrected, that a real email
was delivered, or that production RLS was exercised. No real Auth request, account creation,
password update, customer record mutation or notification was sent by the automated tests.

Final result: production request interception passed for DE and EN with all recovery POSTs
fulfilled locally. The all-mode browser suite passed six mode/language combinations. Recovery
unit tests, site URL tests, site-mode (10), localization (18), template validation (2),
`npx tsc --noEmit`, `npm run lint` and standard lint-enabled `npm run build` passed. Three
existing admin image warnings remain. The isolated build deliberately configured a www site
origin and still produced canonical recovery destinations; it used only synthetic Supabase
configuration and expected missing-backend fallback diagnostics. The temporary build was
removed. The running development server, its build directory, hosted settings and production
accounts were preserved. No commit or deployment was performed.
