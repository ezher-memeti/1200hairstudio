# Disposable Supabase validation

The repository is linked to a production Supabase project. Never use `--linked`, `db push`,
`db reset --linked`, or `migration up --linked` for Phase 1–3 validation.

## Prerequisites

- Docker/Colima with at least 8 GB of free host disk space.
- Supabase CLI compatible with PostgreSQL 17.
- A separately named local project and ports that do not overlap the normal project.
- `database/schema-baseline/current_schema.sql` as the public-schema starting point.
- A verified export of the production Auth signup trigger and Storage buckets/policies. The public
  baseline does not contain those external-schema objects.

The expected external dependencies are:

- `auth.users` and an `AFTER INSERT` trigger that executes `public.handle_new_user()`.
- Public Storage buckets `service-images` and `selected-work-images`.
- Public read policies for objects in those buckets.
- Authenticated write/update/delete policies limited to users whose `public.profiles.role` is
  `admin`.

## Safe local workflow

1. Create a temporary Supabase work directory outside this repository. Give it a unique
   `project_id` and alternate API/database/Studio/Mailpit ports. Disable automatic migrations and
   seed execution for the initial startup.
2. Run `supabase start --workdir <temporary-directory>`. Do not add `--linked`.
3. Apply `database/schema-baseline/current_schema.sql` to the local database with `psql` and
   `ON_ERROR_STOP=1`.
4. Recreate the verified local Auth trigger and Storage dependencies listed above. Do not invent
   production policy definitions; compare them with a read-only production export first.
5. Apply only these incremental files, in filename order, with `ON_ERROR_STOP=1`:
   - `202610310001_secure_guest_booking_and_overlap.sql`
   - `202610310002_customer_authorization_and_rpc_security.sql`
   - `202610310003_enforce_customer_rls_and_rpc_grants.sql`
   - `202610310004_financial_compatibility.sql`
   - `202610310005_enforce_financial_integrity.sql`
6. Read the local keys from `supabase status --workdir <temporary-directory> -o env` and place only
   those local values in `.env.test.local`:

   ```dotenv
   SUPABASE_TEST_URL=http://127.0.0.1:<local-api-port>
   SUPABASE_TEST_PUBLISHABLE_KEY=<local-anon-key>
   SUPABASE_TEST_SERVICE_ROLE_KEY=<local-service-role-key>
   ```

7. Run `npm run test:security-booking`, `npm run test:authorization`, and `npm run test:pos`.
   Each script rejects the normal application URL and refuses an unapproved remote target.
8. Stop and delete the temporary stack after verification.

## Disposable remote fallback

Use this only when local disk remains below the 8 GB safety threshold. Create a new, empty Supabase
project that is not linked to this repository. In addition to the three test values above, set:

```dotenv
SUPABASE_TEST_PROJECT_REF=<exact-disposable-project-ref>
SECURITY_TEST_ALLOW_REMOTE=YES_I_UNDERSTAND_TEST_DATA_ONLY
POS_TEST_ALLOW_REMOTE=YES_I_UNDERSTAND_TEST_DATA_ONLY
```

The test scripts compare the hostname project ref with `SUPABASE_TEST_PROJECT_REF`, reject the
repository-linked project ref, reject the normal application URL, and reject a reused application
service-role credential. Do not set `POS_TEST_ALLOW_CURRENT_DB` for release validation.

The repository-linked project remains rejected unless the operator also supplies the exact,
project-scoped authorization value below. This exception is intended only for an explicitly
authorized development database after a verified backup; it does not weaken the default behavior:

```dotenv
SUPABASE_TEST_LINKED_PROJECT_AUTHORIZATION=ALLOW_PHASE_1_3_TESTING:<exact-linked-project-ref>
```

## Release sequencing

The numbered history is reproducible, but migrations `003` and `005` are enforcement boundaries.
For production, use a coordinated maintenance window: apply all five files in order, deploy the
compatible application immediately, run the read-only verification queries, and reopen writes.
Do not leave the old application serving customer writes after migration `003`, and do not deploy
the new application before migration `004` adds `appointments.loyalty_reward_id` and the new
checkout RPC signature.

The `NOT VALID` financial constraints protect new writes without rewriting historical rows.
Validate them later only after read-only anomaly queries have been reviewed and any correction has
been approved as a separate audited operation.
