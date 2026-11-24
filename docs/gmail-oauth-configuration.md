# Gmail OAuth credentials and diagnostics

## Findings (24 November 2026)

`src/lib/email/gmail.ts` already uses Google's official `google.auth.OAuth2`, sets its
`refresh_token`, and passes that client to `google.gmail({version: 'v1', auth})`. The SDK
obtains/refreshes access tokens and adds the Authorization header. Application code must not
save an access token or manually construct a Bearer header.

There is **no sending-time file loader**. All marketing, transactional booking, recurring,
receipt and reminder email implementations use this shared sender. The Supabase reminder
function invokes the existing internal Next.js reminder endpoint; it does not need Gmail
credentials of its own. No email provider or notification preference behavior was changed.

`/api/google/auth` and `/api/google/callback` are development-only authorization/export tools.
The callback validates OAuth state and writes a newly issued token to an explicitly configured
private file using `wx` and mode 0600. It does not overwrite a file, populate environment
variables, or configure Vercel. Production requests to these authorization routes remain
rejected. `GOOGLE_REFRESH_TOKEN_OUTPUT_PATH` is an export destination, not a credential input.
The historical filename ending in `.json` does not establish its contents' format: the current
callback exports a token as plain text. Never paste the file or its contents into logs/chat.

During this investigation the historical `~/.1200hairstudio/gmail-refresh-token.json` existed,
and `.env.local` declared the OAuth client ID/secret but **did not declare
`GOOGLE_REFRESH_TOKEN`**. Only existence/variable names were checked; no credential was
printed, migrated or modified. A token that exists only in a workstation file cannot authenticate
this environment-based sender. Current Vercel secret values, Google publishing status, and
actual token validity were not inspected, so production's specific provider rejection is not
claimed as confirmed.

The changes trim server credentials, include configuration/client creation in sanitized failure
handling, and retain only fixed error categories, HTTP status and fixed operational guidance.
Google SDK request/config/response payloads, messages, tokens, raw email and addresses are not
propagated or logged. The diagnostic CLI also permits only fixed OAuth error labels.

## Required environment configuration

Set the following as **server-only** secrets in Vercel → Project → Settings → Environment
Variables, in the environment that actually sends email (Production; Preview only if intended):

- `GOOGLE_CLIENT_ID`: the OAuth client which issued the refresh token.
- `GOOGLE_CLIENT_SECRET`: that same client's secret.
- `GOOGLE_REFRESH_TOKEN`: the actual authorized sender's refresh token, with `gmail.send` scope.

Do not prefix any of these with `NEXT_PUBLIC_`, store them in public files, or commit them.
A local token file is not uploaded to Vercel and must not be bundled into the deployment.
After an authorized environment update, a new Vercel deployment is needed to apply it. This task
does not change hosted settings or deploy. For local development, provide the same three
variables in the Git-ignored `.env.local` through a private editor/secret workflow. Keep the
existing private export file unchanged. Copy only the credential value, never a JSON wrapper.
No automatic file import, fallback, overwriting, deletion, rotation or reauthorization was added.

`GOOGLE_REDIRECT_URI` and `GOOGLE_REFRESH_TOKEN_OUTPUT_PATH` are only needed for a deliberate
local OAuth authorization/export. They are not required to send with an existing refresh token.
Existing authorization uses `access_type=offline`, `prompt=consent`, and `gmail.send` scope.
Do not restart authorization simply because a deployment has not been given an existing token.

## Error categories and remediation

| Safe code | Action |
| --- | --- |
| `gmail_configuration_missing` | Supply all three non-empty environment credentials. No reauthorization needed if the stored grant is valid. |
| `invalid_client` | Correct the OAuth client credentials; ensure they match the token. |
| `invalid_grant` | Check the client/token pairing. An expired/revoked grant requires explicit reauthorization; automatic access-token refresh cannot restore it. |
| `gmail_authentication_failed` | Inspect credentials/granted access (HTTP 401); not proof alone that the refresh token is expired. |
| `gmail_permission_denied` | Check `gmail.send` scope and account/Workspace restrictions; a new grant is needed if the required scope was never authorized. |
| `gmail_api_disabled` | Enable Gmail API in the OAuth client's Google Cloud project. |
| `gmail_rate_limited` | Check Gmail quota/rate limits. Do not blindly resend messages with uncertain acceptance. |
| `gmail_delivery_failed` | Check service/network availability using safe status/correlation logs. |

Google documents that refresh tokens issued for an **External** OAuth application in **Testing**
expire after seven days unless only basic identity scopes are requested. `gmail.send` is not
exempt. Check Google Auth Platform → Audience / publishing status in the correct Cloud project.
Do not claim this project's status is Testing without inspecting it. Follow Google's production
publishing/verification requirements as applicable; publishing does not revive an already expired
token. Other invalidation causes include user revocation, six months of disuse, password changes
with Gmail scopes, and token issuance limits. Nothing in this task changes Google account grants.

References:
- [Google OAuth refresh-token expiration](https://developers.google.com/identity/protocols/oauth2#expiration)
- [Google's official Node.js OAuth2 client](https://github.com/googleapis/google-auth-library-nodejs#oauth2)
- [Gmail server-side authorization](https://developers.google.com/workspace/gmail/api/auth/web-server)

## Safe verification

`node scripts/test-gmail-oauth.cjs` uses the real installed OAuth2 client with a mocked transport
and fake credentials. It tests access-token creation/reuse/automatic refresh, invalid/revoked
refresh-grant responses, invalid client, missing credentials, API permissions/quotas, sanitization,
and shared filesystem-free sending. No OAuth request or message reaches Google.

`node scripts/test-email-safety.cjs` covers notification settings, email failure isolation from
business records, failure logs and reminder duplicate prevention using mocked databases/providers.
`node scripts/test-production-logging.cjs` verifies diagnostic safety.

For an explicitly authorized future live credential-only check, `npm run validate:gmail-oauth`
refreshes an access token and checks `gmail.send`; it does not send an email or prove inbox
delivery/sender identity. It was **not run against real credentials in this task**. Real customer
emails, account grants and production database records were not accessed or modified for tests.

Verification completed: mocked OAuth suite, nine email-safety tests, six production-logging
groups, `npx tsc --noEmit`, `npm run lint`, and the standard lint-enabled `npm run build`
passed. Three existing admin image warnings remain. The build used an isolated source copy
with synthetic Supabase configuration and no real Gmail credentials; expected public-settings
fallback diagnostics occurred because no backend was running. The temporary build was removed.
No hosted environment change, commit or deployment was performed.
