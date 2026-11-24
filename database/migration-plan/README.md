# 1200 Hairstudio database migration plan

Status: **prepared for review only**. None of these files has been executed.

## Migration authority decision

Continue using **Supabase migrations** as the sole migration authority.

Do not introduce Flyway for this database. The application depends on Supabase-specific Auth,
Storage, RLS, Data API roles, RPCs, and Edge Functions. A Flyway baseline would create a second
owner for the same PostgreSQL objects while still requiring Supabase-specific deployment steps.

The existing `supabase/migrations` directory must not be overwritten. It contains five applied or
potentially applied migrations, but it cannot recreate the production schema by itself. This plan
therefore lives outside the active migration directory until the remote migration ledger has been
inspected and a deliberate re-baseline is approved.

## Sources of truth during preparation

- `database/schema-baseline/current_schema.sql` is the immutable snapshot of the current
  production `public` schema.
- `supabase/migrations/*.sql` is the existing legacy migration history.
- `database/migration-plan/sql/*.sql` contains ordered corrective migrations prepared by this
  review.
- Supabase remains the eventual execution mechanism. These files are not a Flyway history.

Do not edit the production baseline to make it look like the desired end state. Corrections belong
in later migrations so the transition remains auditable.

## Existing-history assessment

The checked-in migrations cover only services, service-image policies, POS/register objects,
payment compatibility, and removal of two description columns. Production contains 31 tables,
10 functions, 88 RLS policies, 43 foreign keys, and many objects that are absent from the legacy
history.

Before adopting this plan, compare the remote `supabase_migrations.schema_migrations` ledger with
the five local files. Do not infer applied state from filenames alone.

## Re-baseline strategy

Use a controlled Supabase **squash/re-baseline**, not a second migration tool:

1. Tag and archive the exact repository state and remote migration ledger.
2. Restore a sanitized production backup into an isolated Supabase project.
3. Start from a normal fresh Supabase project so the managed `auth`, `storage`, `extensions`, and
   role infrastructure exists.
4. Apply `database/schema-baseline/current_schema.sql` to reproduce the current public schema.
5. Apply the SQL files below in order.
6. Run all verification queries and application tests.
7. Generate a schema diff against the expected end state.
8. Only after validation, promote a reviewed squashed baseline into the Supabase migration history
   and reconcile the remote migration ledger using the supported Supabase migration-repair
   workflow.

Never apply both the legacy five-file bootstrap and the raw production baseline to the same fresh
database. They overlap on services, policies, functions, and POS objects. The production baseline
is the candidate replacement bootstrap after the formal squash; the legacy files remain historical
evidence until that cutover is approved.

## Ordered SQL files

1. `202610310001_external_dependencies.sql`
   - Declares required extensions.
   - Verifies/creates the Auth signup trigger.
   - Declares both Storage buckets and Selected Work policies.
2. `202610310002_security_hardening.sql`
   - Removes the temporary services policy.
   - Prevents anonymous mutation of existing customer records.
   - Restricts unused and privileged functions.
3. `202610310003_discount_compatibility.sql`
   - Reconciles appointment and sale discount values with current application writes.
4. `202610310004_appointment_overlap_protection.sql`
   - Adds atomic confirmed-appointment overlap protection.
5. `202610310005_domain_integrity.sql`
   - Restores service constraints and case-insensitive uniqueness.
   - Adds validated promotion, loyalty, monetary, date, role, and lifecycle checks.
6. `202610310006_singletons_and_timestamps.sql`
   - Enforces single-row settings tables.
   - Adds the missing notification-settings insert policy.
   - Standardizes `updated_at` triggers.
7. `202610310007_privileges_and_indexes.sql`
   - Tightens future function defaults.
   - Adds missing high-value foreign-key indexes.
8. `202610310099_final_verification.sql`
   - Read-only end-state verification queries.

## Prerequisites

- A recent verified production backup and restore test.
- A sanitized staging clone with representative appointments, customers, finance, loyalty,
  marketing, and settings data.
- Supabase CLI compatible with the project and PostgreSQL 17.
- Confirmation of production Auth trigger state.
- Inventory of live Storage buckets and `storage.objects` policies.
- Inventory of remote migration versions.
- A maintenance window for the overlap exclusion constraint and unique-index creation.
- Temporary pause of booking writes while the overlap constraint is built.

## Preflight behavior

The corrective files intentionally stop with exceptions if existing production data violates a new
invariant. They do not delete, merge, or rewrite business records automatically. Resolve failed
preflight checks through a separately reviewed data-repair migration, then retry the structural
migration.

Run the commented read-only preflight queries before scheduling each migration. Keep their output
with the deployment record.

## Application compatibility

- Public services continue to expose active rows only.
- Guest booking retains the existing RPC name and signature. Existing guest rows may be reused,
  but anonymous calls can no longer overwrite customer data. A registered email must sign in.
- Current manual, promotion, legacy custom, and loyalty discount values are accepted.
- Existing booking validation remains in place; the overlap constraint becomes the final atomic
  safeguard.
- Settings and admin actions keep the same table and column names.
- Storage bucket names remain `service-images` and `selected-work-images`.
- No columns or tables used by the application are removed.

## Testing sequence

For every candidate deployment:

1. Restore a sanitized production snapshot.
2. Run the preflight queries without applying changes.
3. Apply one SQL file at a time in a transaction where PostgreSQL permits it.
4. Run that file's post-migration queries.
5. Test anonymous, customer, admin, and service-role access separately.
6. Test registration and confirm profile/customer creation.
7. Test guest booking with a new email, an existing guest email, and a registered email.
8. Test simultaneous booking attempts for the same slot.
9. Test promotion, manual, existing, and all loyalty reward checkout paths.
10. Test service and Selected Work upload/delete operations in Storage.
11. Test notification settings initialization on an empty settings table.
12. Run the final verification file, TypeScript checks, and the production application test suite.
13. Compare the resulting schema with a fresh build from the candidate squashed baseline.

## Production application order

1. Back up and verify restore access.
2. Run all preflight queries.
3. Pause public booking writes.
4. Apply external dependencies and security hardening.
5. Apply discount compatibility.
6. Apply overlap protection while writes remain paused.
7. Apply domain constraints, singleton/timestamp changes, and indexes.
8. Run final verification.
9. Resume booking writes.
10. Run smoke tests and monitor Postgres, Auth, Storage, and Edge Function logs.

## Rollback and forward-fix policy

Prefer forward fixes after a migration has accepted production writes. Constraint and policy
rollbacks can re-open security or integrity gaps.

- Policy/grant changes can be reversed with explicit recreation of the previous policy/grant.
- New indexes and triggers can be dropped if they cause a verified regression.
- New check constraints can be dropped without changing stored data.
- The overlap constraint can be dropped, but only while booking writes are paused and with an
  incident record explaining the loss of protection.
- The guest RPC should not be reverted to anonymous customer mutation. If compatibility problems
  occur, deploy a new trusted server RPC or application path instead.
- Never roll back by restoring an old database over newer production writes. Use point-in-time
  recovery only for catastrophic failure under an approved incident procedure.

## Production requirements not represented by SQL alone

- Auth provider, redirect URL, password, SMTP, and rate-limit configuration.
- Service-role and publishable keys.
- Storage file-size and MIME-type limits.
- Edge Function deployment and secrets.
- Appointment-reminder schedule/cron configuration.
- Internal reminder delivery secret and application URL.

