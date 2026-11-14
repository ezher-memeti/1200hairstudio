# Gate 4 release-blocker remediation

## Gmail OAuth refresh-token procedure

The application sends mail through the Gmail API as `1200hairstudio@gmail.com` and requests only
`https://www.googleapis.com/auth/gmail.send`. It uses an OAuth 2.0 Web application client and needs
offline access because bookings and reminders run without an interactive Google session.

Google Cloud prerequisites:

1. Use the Google Cloud project that owns the existing OAuth client. Enable the Gmail API.
2. Configure the Google Auth Platform consent screen and audience. If publishing status remains
   **Testing**, add the sender Google account as a test user. Google documents that offline refresh
   tokens issued to an External app in Testing can expire; use the appropriate production status
   before relying on unattended production email.
3. Create or reuse an OAuth client whose application type is **Web application**.
4. Add the exact authorized redirect URI `http://localhost:3000/api/google/callback`. Scheme, host,
   port, path, case, and trailing slash must match exactly. This callback is deliberately disabled
   outside `NODE_ENV=development`.
5. Keep the client ID, client secret, refresh token, and private token-output file outside Git.

Local token generation:

1. Stop any production-mode server. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and
   `GOOGLE_REDIRECT_URI=http://localhost:3000/api/google/callback` in the untracked `.env.local`.
2. Set `GOOGLE_REFRESH_TOKEN_OUTPUT_PATH` to a new absolute filename outside the repository. The
   callback creates this file with mode `0600` and `wx`; it refuses relative paths, repository paths,
   and overwrites.
3. Start `npm run dev`, then open `http://localhost:3000/api/google/auth` in the same browser session.
4. Sign in as the Gmail sender, inspect the requested permission, and grant Gmail send access. The
   route requests `access_type=offline`, `prompt=consent`, and a one-time CSRF state value.
5. The callback exchanges the code, validates state, writes the refresh token only to the configured
   private file, deletes the state cookie, and returns no credential in its response or logs.
6. Transfer the token into the local/Vercel `GOOGLE_REFRESH_TOKEN` secret through their secret-entry
   interfaces. Securely remove the one-time output file only after both environments are verified.
7. Run `npm run validate:gmail-oauth`. This refreshes an access token and reads the Gmail profile; it
   sends no email and prints no credential.

If Google returns no refresh token, revoke the OAuth client's access from the sender Google Account
and repeat the consent flow. Do not use OAuth Playground unless its redirect URI and client setup are
deliberately adopted; the repository flow already provides the required server-side exchange.

After the non-sending validator passes, use uniquely marked disposable bookings and verify, in order:

1. regular guest booking confirmation;
2. reschedule notification;
3. recurring-series summary;
4. reminder endpoint authenticated with `REMINDER_DELIVERY_SECRET`;
5. email-log status, provider message ID, recipient, and received message for every case.

Delete only test-created business rows and retain the delivery logs long enough to review them.

Primary references:

- https://developers.google.com/workspace/gmail/api/auth/web-server
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/workspace/gmail/api/auth/scopes

## Production dependency audit

Initial `npm audit --omit=dev`: 7 package findings (4 high, 3 moderate). A normal semver update plus
the smallest fixed Google client line removed five package findings. No override, force fix, or
Next.js 16 upgrade was used.

| Initial package | Initial path/version | Advisory range | Resolution and reachability |
| --- | --- | --- | --- |
| `brace-expansion` | `googleapis > gaxios > rimraf > glob > minimatch > brace-expansion@2.1.4` | three DoS advisories, fixed cumulatively in `2.1.7` | Updated to `2.1.7`, then removed from the production tree by `googleapis@178.1.1`. Glob patterns were library-internal, not supplied by application users. Resolved. |
| `glob` | same Google chain, `10.3.10` | command injection fixed in `10.5.0`; cancellation traversal fixed after `14.0.1` | The compatible update reached `10.5.0`; upgrading Google APIs then removed `glob` and `rimraf` from the production tree. The app never invokes the glob CLI or accepts glob patterns. Resolved. |
| `minimatch` | same Google chain, `9.0.9` | globparts amplification `<11.0.1` | Removed from the production tree by the Google client update. No user-controlled glob evaluation exists. Resolved. |
| `qs` | `googleapis > googleapis-common > qs@6.15.3` | advisories through `6.16.0` | Updated to `6.17.1`. Application routes use Next URL parsing rather than calling `qs` directly. Resolved. |
| `source-map-js` | PostCSS/Tailwind, `1.2.1` | indexed-map DoS `<1.2.2` | Updated to `1.2.2`. Resolved. |
| `next` | direct `next@15.5.28 > postcss@8.4.31` | inherited PostCSS finding | No patched Next 15 package currently replaces its pinned PostCSS; `15.5.29` still pins `8.4.31`. npm proposes breaking `next@16.4.5`. Open. |
| `postcss` | bundled under Next, `8.4.31` | four advisories fixed after `8.5.22` | The app does not accept or compile user CSS at runtime. Exploitation would require attacker-controlled CSS/source-map input during a trusted build, so remote production reachability is not confirmed. Audit remains open; do not override Next's private dependency without framework support. |

Current production audit: only `next` and its bundled `postcss` remain (1 moderate package entry and
1 high package entry). `googleapis` is pinned to `178.1.1`; it requires Node 22. The project declares
`node >=22 <23`, which must match Vercel Project Settings.

## Supabase migration-history reconciliation

Final status: completed on 7 November 2026 under explicit approval. The connected ledger now contains
the ten unique applied versions documented in `gates-1-4-final-report.md`; no migration SQL was run.

Confirmed state:

- The remote `supabase_migrations.schema_migrations` relation was absent at Gate 2.
- SQL for migrations 001–005 was explicitly applied and verified; it must not run again.
- Both `20260821_create_services.sql` and `20260821_service_images_admin_policies.sql` resolve to
  ledger version `20260821`.
- A PostgreSQL 17 synthetic ledger reproduced the primary-key collision. A history-only sequence with
  `202608210001` and `202608210002` inserted all ten versions successfully.
- The schema baseline contains the service objects created by the first file and the service/Storage
  policy family from the second file. It also recorded the temporary service policy later removed by
  migration 002. The baseline reflects the legacy POS tables and the later description-column removal.
- Gate 2 verification established the post-005 functions, grants, policies, constraints, and tests.
  Gate 4's read-only assessment still reports the same business counts and zero known financial
  anomaly/precondition counts.

Executed history-only procedure:

1. Freeze migration work and preserve the recorded SHA-256 hashes of all ten SQL files.
2. Rename only the two colliding local files to
   `202608210001_create_services.sql` and `202608210002_service_images_admin_policies.sql`; do not
   change their SQL content.
3. Re-run schema/policy/function verification against the connected project. Abort on any mismatch.
4. Create/repair ledger entries as **applied** for the ten canonical versions in one reviewed session.
   Use history-repair functionality only; do not use `db push` or `migration up --linked`.
5. Query the ledger and confirm exactly ten ordered unique rows. Compare application object hashes and
   re-run the read-only verification plus all three integration suites.
6. Test a dry run with a new empty no-op migration in an isolated project before accepting future
   migrations. Never execute that no-op against the connected project.

The earlier isolated test validated version uniqueness and ordering. The approved linked repair later
marked the ten verified versions applied. Byte-identical pre/post dumps confirmed that application,
Auth, and Storage schemas were not modified by reconciliation.

## Vercel configuration

Required for Preview and Production unless noted:

| Variable | Exposure | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | Exact project URL for `rqavijckrxkecaxnyiex` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser + server | Publishable/anon client key |
| `SUPABASE_SERVICE_ROLE_KEY` | server secret | Trusted server operations; never expose to browser |
| `NEXT_PUBLIC_SITE_URL` | browser + server | Canonical URL used in booking/account links |
| `GOOGLE_CLIENT_ID` | server secret/config | Gmail OAuth client |
| `GOOGLE_CLIENT_SECRET` | server secret | Gmail OAuth client secret |
| `GOOGLE_REFRESH_TOKEN` | server secret | Offline Gmail access; currently invalid |
| `GOOGLE_REDIRECT_URI` | server config | Needed only for local token generation; production callback is disabled |
| `REMINDER_DELIVERY_SECRET` | server secret | Authorizes the reminder delivery endpoint/job |

`GOOGLE_REFRESH_TOKEN_OUTPUT_PATH` is local-development-only and must not be configured in Vercel.
Set the Vercel Node.js version to 22.x. Verify values through existence/fingerprint checks, never by
printing them. The local checkout is not linked to Vercel, so remote environment scopes remain to be
verified by a project owner.
