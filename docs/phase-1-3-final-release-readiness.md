# Phase 1-3 final release-readiness report

Date: 2026-11-02

Verdict: **BLOCKED — isolated end-to-end environment not available**

## Environment result

- Local startup was not attempted: the host had 5.1 GB free while the documented safe minimum is
  8 GB. Colima was stopped. No Docker image, container, volume, or unrelated asset was deleted.
- No disposable remote Supabase URL, project ref, publishable key, or service-role key was
  configured. No remote project was created or contacted.
- The repository-linked production project was not contacted and no SQL was executed against it.
- The public baseline contains `public.handle_new_user()`, but not the `auth.users` trigger that
  invokes it. The repository has verified SQL for the `service-images` bucket/policies, but no
  verified SQL for the `selected-work-images` bucket/policies. Reconstructing these from expected
  behavior would invent production configuration and was therefore refused.

## Confirmed checks

- Next.js 15.5.28 production build, TypeScript, and lint passed in the preceding upgrade review;
  `/` remains in the prerender manifest.
- Migrations 001-005 previously applied in order to a disposable PostgreSQL 17 public-schema test,
  and public-schema lint passed. That did not test Auth, PostgREST, or Storage.
- All three integration scripts parse successfully.
- All three scripts were exercised with deliberately mismatched fake remote identity values and
  rejected execution before making a network request.
- Remote execution now requires an exact `SUPABASE_TEST_PROJECT_REF` hostname match, explicit test
  opt-in, a project ref different from the repository-linked ref, a URL different from the normal
  application URL, and a service-role credential different from the application credential.
- The POS suite can no longer override the production-URL rejection.
- `supabase/phase-1-3-read-only-verification.sql` contains SELECT statements only. Its production
  execution process is documented in `docs/phase-1-3-production-verification-checklist.md`.

## Tests blocked before execution

`npm run test:security-booking`, `npm run test:authorization`, and `npm run test:pos` remain
**UNTESTED against a complete stack** because no safe isolated endpoint exists. Consequently, the
following behaviors are not release-verified end to end:

- Auth signup trigger execution and guest-to-registered-customer claiming;
- authenticated ownership/RLS, trusted customer updates, and marketing consent RPCs;
- guest booking, customer booking, overlap conflicts, and management-token rescheduling;
- admin service, customer, appointment, register, promotion, and financial operations;
- both Storage buckets' customer denial, admin writes, and public reads;
- fixed, percentage, free-service, manual, and promotion discounts;
- one-time loyalty redemption and cross-customer rejection;
- concurrent checkout, split payments, tips, cash change, refunds, and over-refund rejection;
- receipt creation, PDF generation, authenticated ownership download, and emailed-receipt behavior.

The existing suites are designed to cover most database authorization, booking concurrency, POS,
discount, loyalty, refund, and register behavior. They do not currently prove the complete
management-token rescheduling flow or application-level receipt/PDF/email flow; those require a
running Next.js instance pointed only at the disposable project plus dedicated application smoke
tests.

## Remaining dependency findings

The last `npm audit --omit=dev` after Next.js 15.5.28 reported zero critical, four high, and three
moderate package findings. They are transitive chains through Next.js (`postcss`, `source-map-js`)
and Google APIs (`glob`, `minimatch`, `brace-expansion`, `qs`). Candidate overrides were not kept:
they did not produce a clean npm audit result and would override versions pinned by upstream
packages. The known application paths do not process attacker-supplied CSS/source maps or glob
patterns, but these findings remain open supply-chain/build-worker risks.

## Historical-data risk

- Migrations 004/005 deliberately avoid rewriting historical financial records and add relevant
  checks as `NOT VALID`.
- Production anomaly queries have not been run, so no customer, reward, sale, payment, refund, or
  receipt record can be declared clean or anomalous.
- Duplicate normalized customer emails can block 001. Duplicate reward-to-appointment links can
  block 004. Both must be checked before the maintenance window.
- Constraint validation must remain a separate, approved operation after manual reconciliation.

## Required path to unblock

1. Supply a verified read-only export from production of the `auth.users` trigger and the two
   Storage bucket/policy definitions using the production checklist. Do not supply customer rows or
   credentials in chat.
2. Provide either at least 8 GB safe local free space or a newly created disposable Supabase project
   with its exact project ref and test-only credentials in `.env.test.local`.
3. Recreate only the verified external-schema definitions, load the public baseline, and apply
   001-005 with `ON_ERROR_STOP=1`.
4. Run all three suites, then run a disposable Next.js instance for registration, booking,
   rescheduling, receipt/PDF, middleware, image, and authenticated-route smoke tests.
5. Record cleanup evidence showing that all test users/objects were removed or delete the entire
   disposable project.

## Coordinated deployment procedure

1. Freeze customer/admin writes and verify a current database backup/PITR recovery point.
2. Confirm the approved project identity and run all read-only prechecks.
3. Apply migrations 001-005 in filename order with `ON_ERROR_STOP=1`. Each migration is
   transactional; stop immediately on failure.
4. Deploy the matching Next.js 15.5.28 application without reopening writes between migration 003
   and the application deployment, or between application deployment and migration 004.
5. Run Auth, guest booking, registered booking, admin, Storage, checkout/refund, receipt, static
   homepage, middleware, and image-optimizer smoke tests.
6. Run the read-only postchecks, review logs, then reopen writes.

## Rollback and forward-fix policy

- If a migration fails before commit, rely on its transaction rollback, keep writes frozen, and
  investigate. Do not skip or reorder migrations.
- After migrations commit, do not deploy the pre-Phase application: migrations 003 and 005 remove
  permissions/signatures it expects, while the new application expects additions from 002/004.
- Prefer a reviewed forward fix while maintenance remains active. Do not weaken RLS, constraints,
  or RPC authorization to restore service.
- Use full database restore/PITR only for a declared incident with the rollback owner’s approval;
  restoring the database independently of Auth/Storage state can create inconsistency.
- Application rollback is safe only to an artifact proven compatible with the post-005 schema.
  Keep the database change window open until that artifact and the Next.js 15 release pass smoke
  tests.

No deployment, commit, production SQL, migration edit, customer-data change, or financial-data
change was performed during this review.
