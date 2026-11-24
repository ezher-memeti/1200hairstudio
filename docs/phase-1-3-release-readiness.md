# Phase 1-3 release-readiness review

Date: 2026-11-02

Verdict: **BLOCKED** until Next.js is upgraded and the full Supabase integration suites pass
against an isolated stack that includes Auth, PostgREST, Storage, and the five incremental
migrations.

## Confirmed validation

- Migrations `202610310001` through `202610310005` execute in filename order against a disposable
  PostgreSQL 17 database seeded from the public schema baseline.
- `supabase db lint` reports no public-schema errors after all five migrations.
- The current Phase 1-3 application passed TypeScript, lint (three pre-existing `<img>` warnings),
  and a production build using a 4 GB Node heap. The homepage remained statically prerendered
  (`○ /`).
- The production build used Next.js 14.2.30 and therefore does not establish dependency security.
- The three integration scripts refuse to use ordinary application credentials and failed closed
  when isolated credentials were absent.
- No SQL was run against production and no historical financial row was changed.

## Release blockers

1. **Critical: unsupported and vulnerable Next.js.** `next@14.2.30` is outside LTS and is affected
   by unauthenticated image-optimizer RCE and App Router Server Action denial-of-service issues.
   This application uses both `next/image` with a remote Supabase Storage pattern and many Server
   Actions. Upgrade to `next@15.5.28` and matching `eslint-config-next@15.5.28`, then complete the
   compatibility work and repeat all checks. Do not use `npm audit fix --force`; it currently
   proposes Next 16.4.4.
2. **High: integration behavior is not verified.** Auth, RLS, guest booking, overlap protection,
   loyalty/POS atomicity, and Storage policies have not run together in a complete disposable
   Supabase stack.
3. **High: production external-schema state is unknown.** The public schema export cannot prove
   the `auth.users` signup trigger or Storage bucket/policy definitions. Run
   `supabase/phase-1-3-read-only-verification.sql` through an approved read-only production
   connection before scheduling the release.
4. **High: historical anomalies are unknown.** The review queries exist, but no production results
   were supplied. Any returned IDs require manual business reconciliation before validating the
   `NOT VALID` constraints; do not normalize them automatically.

## Dependency advisory review

`npm audit --omit=dev` on the current lockfile reports 7 vulnerable packages: 1 critical, 4 high,
and 2 moderate. The Next.js entry aggregates the following advisories. “First secure 15.x” is the
lowest maintained-line release outside each reported range; 15.5.28 clears all listed Next.js
framework advisories.

| Advisory | Severity | Affected range reported by npm | First secure release relevant here | Application reachability |
|---|---:|---|---|---|
| GHSA-g5qg-72qw-gw5v image cache-key confusion | Moderate | `<14.2.31` | 14.2.31 | Image optimizer used; local-file disclosure conditions are hosting-dependent |
| GHSA-4342-x723-ch2f middleware redirect SSRF | Moderate | `<14.2.32` | 14.2.32 | Middleware used, but it does not issue attacker-controlled redirects |
| GHSA-xv57-4mr9-wg8v image content injection | Moderate | `<14.2.31` | 14.2.31 | Image optimizer used; strict HTTPS Supabase path reduces but does not remove framework exposure |
| GHSA-mwv6-3258-q52c RSC DoS | High | `13.3.0–<14.2.34` | 14.2.34 | Reachable: App Router/RSC used |
| GHSA-5j59-xgg2-r9c4 RSC DoS follow-up | High | `13.3.1-canary.0–<14.2.35` | 14.2.35 | Reachable: App Router/RSC used |
| GHSA-9g9p-9gw9-jx7f remotePatterns image DoS | Moderate | `10.0.0–<15.5.10` | 15.5.10 | Vercel hosting lowers self-hosted condition; remotePatterns is configured |
| GHSA-h25m-26qc-wcjf insecure RSC deserialization DoS | High | `13.0.0–<15.0.8` | 15.0.8 | Reachable: RSC used |
| GHSA-ggv3-7p47-pfv8 rewrite request smuggling | Moderate | `9.5.0–<15.5.13` | 15.5.13 | Not presently reachable: no rewrites configured |
| GHSA-3x4c-7xq6-9pq8 image disk-cache exhaustion | Moderate | `10.0.0–<15.5.14` | 15.5.14 | Optimizer used; Vercel limits persistence/host impact |
| GHSA-q4gf-8mx6-v5v3 RSC DoS | High | `13.0.0–<15.5.15` | 15.5.15 | Reachable: RSC used |
| GHSA-8h8q-6873-q5fj RSC DoS | High | `13.0.0–<15.5.16` | 15.5.16 | Reachable: RSC used |
| GHSA-3g8h-86w9-wvmq redirect cache poisoning | Low | `12.2.0–<15.5.16` | 15.5.16 | Middleware used; no redirect logic found |
| GHSA-ffhc-5mcf-pf4q CSP nonce XSS | Moderate | `13.4.0–<15.5.16` | 15.5.16 | No CSP nonce implementation found |
| GHSA-vfv6-92ff-j949 RSC cache-busting collision | Low | `13.4.6–<15.5.16` | 15.5.16 | Potentially reachable through RSC caching |
| GHSA-gx5p-jg67-6x7h `beforeInteractive` XSS | Moderate | `13.0.0–<15.5.16` | 15.5.16 | No `beforeInteractive` script found |
| GHSA-h64f-5h5j-jqjh image API DoS | Moderate | `10.0.0–<15.5.16` | 15.5.16 | Image optimizer used |
| GHSA-c4j6-fc7j-m34r WebSocket-upgrade SSRF | High | `13.4.13–<15.5.16` | 15.5.16 | Not presently reachable: no custom WebSocket upgrade handler |
| GHSA-wfc6-r584-vfw7 RSC cache poisoning | Moderate | `14.2.0–<15.5.16` | 15.5.16 | Potentially reachable through RSC responses |
| GHSA-36qx-fr4f-26g5 middleware bypass | High | `12.2.0–<15.5.16` | 15.5.16 | Not matching exploit conditions: App Router, no Pages i18n |
| GHSA-m99w-x7hq-7vfj Server Action DoS | High | `13.0.0–<15.5.21` | 15.5.21 | Reachable: many Server Actions |
| GHSA-89xv-2m56-2m9x Server Action SSRF | High | `14.1.1–<15.5.21` | 15.5.21 | No custom server; Vercel deployment does not match stated condition |
| GHSA-68g3-v927-f742 request-body cache confusion | Moderate | `13.0.0–<15.5.21` | 15.5.21 | Framework endpoint exposure possible |
| GHSA-4633-3j49-mh5q invalid-UTF8 cache confusion | Moderate | `13.0.0–<15.5.21` | 15.5.21 | Framework endpoint exposure possible |
| GHSA-4c39-4ccg-62r3 unbounded Edge Server Action payload | Moderate | `13.0.0–<15.5.21` | 15.5.21 | No explicit Edge Server Actions found |
| GHSA-p9j2-gv94-2wf4 rewrite SSRF | High | `12.0.0–<15.5.21` | 15.5.21 | Not presently reachable: no rewrites configured |
| GHSA-955p-x3mx-jcvp Server Function endpoint disclosure | Moderate | `13.0.0–<15.5.21` | 15.5.21 | Server Actions exist; authorization remains required even after patching |
| GHSA-p293-qw3h-jr36 Windows RCE | Critical | `13.4.0–<15.5.24` | 15.5.24 | Not reachable on Vercel Linux runtime |
| GHSA-2xp9-vwfh-vxw4 AVIF image RCE | Critical | `10.0.0–<15.5.24` | 15.5.24 | Image API exists; no explicit AVIF format, but framework must be patched |
| GHSA-2464-fhr4-w9xw SVG image RCE | Critical | `10.0.0–<=15.5.27` | **15.5.28** | Strict Storage path and default SVG refusal reduce exposure; upgrade is still mandatory |
| GHSA-p3m5-59mp-jv5r Server Action DoS | High | `13.0.0–<=15.5.27` | **15.5.28** | Reachable: many Server Actions |

Other production dependency findings:

- Exact npm advisory floors for the current transitive packages are: `brace-expansion` 2.1.7
  (GHSA-q2hr-2g5m-vwhr; 2.1.6 for GHSA-qhr7-859c-m2p7; 2.1.5 for
  GHSA-6j4f-fj2g-mc7p), `glob` 10.5.0 for the CLI injection
  (GHSA-5j98-mcp5-4vw2) and a version above 14.0.1 for the cancellation bypass
  (GHSA-3g3m-2fjr-6pw4), `minimatch` 11.0.1 (GHSA-g3hv-75wg-m249), `postcss` 8.5.23
  (the highest affected range is `<=8.5.22`, covering GHSA-qx2v-qp2m-jg93,
  GHSA-6g55-p6wh-862q, GHSA-fxqj-rqcc-2cmp, and GHSA-r28c-9q8g-f849), `qs` above
  6.16.0 (GHSA-x5fp-wj9c-mxmx, GHSA-4mjr-xmp4-gh2g, GHSA-6pq8-jhm2-2vcw), and
  `source-map-js` 1.2.2 (GHSA-68fv-2mgg-jv7q).
- `postcss@8.4.31` and `source-map-js@1.2.1` are nested under Next. The reported PostCSS file-read
  and source-map DoS paths require attacker-controlled CSS/source maps to be processed; this app
  only processes repository CSS during builds. A temporary Next 15.5.28 resolution still reports
  this chain because Next 15 pins PostCSS 8.4.31. Treat it as a supply-chain/build-worker finding;
  test a narrow npm override only after the framework upgrade, rather than forcing Next 16.
- `glob@10.3.10`, `minimatch@9.0.9`, and `brace-expansion@2.1.4` arrive through Google API cleanup
  tooling (`googleapis -> gaxios -> rimraf -> glob`). The command-injection advisory affects the
  `glob` CLI `--cmd` path, which the application does not invoke. The pattern DoS paths are not fed
  user-controlled patterns by application code. Update through a tested Google dependency release
  or a lockfile-only transitive refresh; do not use forced audit remediation.
- `qs@6.15.3` arrives through `googleapis-common`. Application calls construct ordinary scalar
  Google API parameters rather than attacker-created objects with hostile `isBuffer`/`toString`
  properties, so the published DoS preconditions are not reachable through normal HTTP input.

## Smallest supported upgrade path

1. Create a review branch and change only `next` and `eslint-config-next` to `15.5.28` first.
   Keep React/React DOM at 18.3.1 initially: the package peer range accepts `^18.2.0` even though
   current upgrade documentation recommends React 19. This separates framework security from a
   larger React migration.
2. Convert synchronous dynamic route/page `params` and `searchParams` props to the Next 15 async
   form. Confirm at least the booking management, unsubscribe, account receipt, admin receipt,
   financial report, register report, appointments, customer email, and end-of-day routes/pages.
3. Retest middleware cookie refresh and redirects. `@supabase/ssr` already uses `getAll`/`setAll`,
   and server cookie access is already awaited; no Supabase architecture change is indicated.
4. Build with the 4 GB heap, confirm `○ /`, run TypeScript/lint, exercise authentication and every
   affected dynamic route, and rerun all integration suites.
5. Re-run `npm audit --omit=dev`. Resolve Google transitive packages without `--force`. Evaluate a
   narrowly scoped PostCSS/source-map override in isolation and retain it only if build and visual
   regression tests pass.

## Disposable Supabase strategy under disk pressure

- Do not start the stack below 8 GB free host space. The host had about 7.5 GB free during this
  review and the Colima runtime was stopped, so a new pull was not considered safe.
- Preserve all unrelated Docker objects. Reclaim only reproducible project output such as `.next`
  (about 969 MB), or move the dedicated Colima data disk to a volume with adequate free space.
- Use a separate temporary Supabase work directory, unique project ID/ports, and exclude optional
  services (`studio`, `realtime`, `edge-runtime`, analytics/logging/vector, `supavisor`, `imgproxy`).
  Keep Postgres, Kong/API, GoTrue, PostgREST, and Storage because the test scope requires them.
- Seed the public baseline, recreate only the verified Auth trigger and Storage objects, apply
  001-005 with `ON_ERROR_STOP=1`, export local-only test keys, and run the three suites.
- Stop the stack and remove only containers, volumes, networks, and images identified by that
  temporary project label. A disposable remote Supabase project is an acceptable fallback if its
  URL/ref are explicitly allow-listed by the test scripts and production credentials are absent.

## Migration/application deployment dependencies

- `001` can stop on duplicate normalized customer emails; it establishes guest isolation and
  overlap protection used by the new booking error handling.
- `002` requires the real `auth.users -> public.handle_new_user()` trigger and introduces trusted
  customer RPCs used by the Phase 2 application.
- `003` removes direct customer writes and narrows EXECUTE grants. Do not leave the old app serving
  writes after it is applied.
- `004` adds `appointments.loyalty_reward_id`, discount triggers, and the new atomic checkout RPC
  signature. Do not deploy the new app before it exists. It can stop on duplicate loyalty reward
  redemption links.
- `005` drops the legacy checkout signature and protects all new financial writes with `NOT VALID`
  constraints. It depends on the Phase 3A signature from `004`.
- Use a coordinated maintenance window: pause writes, run the read-only prechecks, apply 001-005 in
  order, deploy the matching application immediately, run smoke/read-only verification, then
  reopen writes. Apply the Next.js security upgrade before this release candidate is approved.

## Historical reconciliation status

No production result set was available, so **no specific record can be declared anomalous or
clean**. The read-only script reports duplicate normalized customers, duplicate reward linkage,
legacy discount values, inconsistent reward ownership/status, promotion/settings values, sales
arithmetic, payment/refund/tip anomalies, over-refunds, receipt arithmetic, and constraint status.
Returned rows are review candidates; zero-tip refunds in particular are not automatically errors.

## Changes made by this review

- Added `supabase/phase-1-3-read-only-verification.sql` (SELECT-only).
- Added this report.
- No package, lockfile, application, migration, database, or production changes were made.
