# Gates 1–4 final security and release report

Date: 7 November 2026  
Supabase project: `rqavijckrxkecaxnyiex`  
Application: Next.js 15.5.28, React 18.3.1, Node.js 22, Supabase PostgreSQL 17

## Verdict

The codebase and database are a stable post-Phase-1–3 baseline and are ready for the next development
tasks. They are **not ready to deploy** until Gmail credentials and the actual Vercel project settings
are verified. The remaining Next.js-bundled PostCSS advisory is temporarily accepted for development
use only because no attacker-controlled CSS reaches the build pipeline and no compatible Next.js 15
package contains a patched PostCSS version.

## Completed work

- Applied and verified Phase 1–3 migrations 001–005 without changing historical business data.
- Hardened guest booking, customer isolation, RLS, RPC authorization, Storage authorization, booking
  concurrency, discounts, loyalty, POS checkout, refunds, and receipts.
- Upgraded Next.js to 15.5.28 and retained React/React DOM 18.3.1.
- Upgraded `googleapis` to 178.1.1 and patched/remediated five production dependency findings.
- Hardened Google OAuth with development-only routes, CSRF state validation, and exclusive mode-0600
  refresh-token output outside the repository.
- Added non-sending Gmail credential validation and receipt-PDF regression coverage.
- Removed verbose production appointment-slot diagnostic logging.
- Preserved the static homepage, existing design, responsive behavior, animations, accounts, admin,
  booking, and finance behavior.

## Migration-history reconciliation

The two colliding files were renamed without changing their byte content:

- `20260821_create_services.sql` → `202608210001_create_services.sql`
- `20260821_service_images_admin_policies.sql` →
  `202608210002_service_images_admin_policies.sql`

Verified SHA-256 hashes:

| Version | SHA-256 |
| --- | --- |
| `202608210001` | `d38b0766c17bf9b0f11f67dff067e7eefbce47f83274eaeaf021d18240a46411` |
| `202608210002` | `f5fe5c937c379878187b6a663f59139d09ef4e3109ccb7fa794b2179f1e14719` |
| `20260920` | `172538ef214d6997e1fa18aa1d8d5de698d0c2da47e596460cfd8d8cff846b5e` |
| `20260921` | `2ec39ac046ca476e656499e8f5624126692cb55c3839dc2dfce7914587c21f79` |
| `20260922` | `54e443f2dd27e6640d4290ab39124cf61cc422e1a96d4f83e47a71476e30a062` |
| `202610310001` | `f7ef3bd8c43bfab6d4efd557c6720f756e53f29d3f4977f97fea4a7cf2a60bb7` |
| `202610310002` | `8a04c1c9c607b42af0e3e763940ef7b8f35ea703b636a6d72d8d284f7651883d` |
| `202610310003` | `04a35558bdb96e2d94d744e97a3f8e9fb839d95ae11ce695dca44dbaf3dad71a` |
| `202610310004` | `1c93624e7ec5d410d6a2086a9db6a6754f716d5b697e90b5fdf3e3170d8632e8` |
| `202610310005` | `a6b181df8cf8de077972aee51ffbe3772a978b62f77fd51e131d3e0395073b5f` |

Before ledger repair, a fresh live schema dump verified the service/Storage history, description-column
removal, POS/register schema, Phase 1–3 RPC signatures, grants, policies, triggers, and constraints.
The temporary service policy and legacy 13-argument checkout RPC were absent. The 14 financial
constraints remain `NOT VALID`; none was validated.

The Supabase CLI history-repair command marked exactly these ten versions **applied**. It did not run
migration SQL. Final `migration list --linked` reports ten unique local/remote matches and no drift.
Pre/post dumps of `public`, `auth`, and `storage` were byte-identical with SHA-256
`6a898c797c656acdfc86cecce43b43314c4fbd5287e67787f6b41a1b4f647050`, proving the ledger repair and
test run did not change application/Auth/Storage schemas.

## Verification results

| Check | Result |
| --- | --- |
| TypeScript (`npx tsc --noEmit`) | Passed |
| ESLint | Passed; three existing admin `<img>` performance warnings |
| Production build, 4 GB heap and live Supabase reads | Passed |
| Homepage output | Static `○ /` |
| Receipt PDF regression | Passed: valid one-page PDF, 1,829 bytes |
| Security-booking integration suite | Passed; cleanup completed |
| Authorization integration suite | Passed; cleanup completed |
| POS integration suite | Passed; cleanup verified zero test records |
| Final database integrity assessment | Passed; baseline counts restored and anomaly counts zero |
| Migration ledger | Passed; exactly ten unique matching versions |
| Pre/post schema comparison | Passed; byte-identical |
| OAuth authorization route | Passed: 307 with redacted HTTP-only SameSite state cookie |
| OAuth missing-state rejection | Passed: HTTP 400; no token file created |
| Gmail credential validation | Failed as expected: existing refresh token rejected with code 400 |
| Production dependency audit | Two package entries remain: Next.js and its bundled PostCSS |

Final database state remains 4 Auth users, 4 profiles/customers, 2 appointments, 3 recurring series,
1 sale/payment/receipt, and the original two Storage buckets/objects. Known financial anomaly counts,
duplicate customer emails, appointment overlaps, duplicate reward redemptions, and open registers are
all zero.

## Dependency security status

`npm audit --omit=dev` reports:

- `next@15.5.28` because it pins `postcss@8.4.31`;
- `postcss@8.4.31`, affected by stringify XSS and source-map path/file-read advisories.

Every published Next.js 15 release through 15.5.29 still declares PostCSS 8.4.31. npm's proposed fix
is the unapproved breaking upgrade to Next.js 16.4.5. No force fix or dependency override was used.

Actual application exposure is limited: the application does not accept customer CSS, compile CSS at
request time, or pass user-controlled source maps into PostCSS. Exploitation would require malicious
CSS/source-map input entering the trusted build environment. This is a temporary development-only risk
acceptance, not a claim that the advisory is fixed. Re-evaluate when a supported framework patch or a
separately tested Next.js 16 upgrade is approved.

## User actions still required

### Gmail

1. In Google Cloud, confirm Gmail API is enabled and inspect Google Auth Platform → Audience. If the
   external app is in **Testing**, add the sender as a test user and recognize that offline refresh
   tokens can expire; move to the appropriate production publishing status before relying on email.
2. Confirm the Web application client has the exact redirect URI
   `http://localhost:3000/api/google/callback`.
3. Set `GOOGLE_REFRESH_TOKEN_OUTPUT_PATH` to a new absolute filename outside the repository.
4. Run `npm run dev` and open `http://localhost:3000/api/google/auth` in the same browser session.
5. Authorize the sender for only `https://www.googleapis.com/auth/gmail.send`.
6. Transfer the generated token from the mode-0600 output file into `.env.local` and Vercel secret
   storage; do not commit or paste it into logs.
7. Run `npm run validate:gmail-oauth` and require a pass.
8. Send and receive disposable booking-confirmation, reschedule, recurring-summary, reminder, and
   receipt emails. Email delivery must remain classified as unavailable until all five pass.

### Vercel

The local checkout is not linked to a Vercel project, so remote settings could not be inspected.
Verify manually:

- Node.js runtime is 22.x, matching `package.json` (`>=22 <23`).
- Production/Preview scopes contain the correct project-specific values for
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `NEXT_PUBLIC_SITE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, and
  `REMINDER_DELIVERY_SECRET`.
- Service-role, Google client secret, refresh token, and reminder secret remain server-only.
- `GOOGLE_REFRESH_TOKEN_OUTPUT_PATH` is not configured in Vercel.
- The production branch and deployment target are the intended development environment.

Static source scanning found no `NEXT_PUBLIC_` alias for a server secret and no client-component use of
the service-role key, Google secret/refresh token, or reminder secret.

## Deployment and rollback checklist

Before deployment:

1. Obtain a fresh verified backup/recovery point.
2. Complete Gmail and Vercel actions above.
3. Confirm all ten migration versions still match and do not run any migration command.
4. Build from the reviewed working tree with Node 22 and the lockfile.
5. Deploy first to the existing development/Preview environment.

Post-deployment smoke tests:

- static homepage, scroll animation, Section Two, Services, gallery, desktop/tablet/mobile;
- guest booking, management link, rescheduling, recurring booking, and all notification emails;
- authenticated customer registration/account isolation;
- admin dashboard, Storage uploads, POS, loyalty, refunds, receipts, PDF download, and reports;
- browser console/hydration/layout-shift checks and database anomaly queries.

Rollback:

- Roll back only to a known Vercel artifact compatible with migrations 001–005.
- Do not revert the migration ledger or re-execute historical SQL.
- Do not deploy a pre-Phase-1–3 application against the hardened database.
- Prefer an application forward fix; use the verified database backup only for genuine disaster
  recovery, not routine rollback.

No deployment or commit was performed.

An unrelated untracked `generate-gmail-token.cjs` file was present at final review. It was not created
or modified during this work. A redacted static scan found environment-variable use and no embedded
Google client ID, client-secret, or refresh-token pattern, but it is not gitignored; confirm whether it
is intentional before preparing the eventual commit.
