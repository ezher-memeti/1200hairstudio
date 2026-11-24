# Phase 1-3 production verification checklist

This checklist is read-only. It does not authorize migration execution, deployment, or data fixes.

## Approval and identity gate

- Obtain a change-window identifier, named operator, reviewer, and rollback owner.
- Confirm the Supabase dashboard project ref and database host against the approved production
  inventory. Do not infer identity from a copied connection string alone.
- Confirm the connection uses a dedicated read-only verification role. It needs metadata visibility
  for `auth`, `storage`, `pg_catalog`, and `information_schema`, but no INSERT, UPDATE, DELETE,
  TRUNCATE, DDL, function execution that mutates data, or role-management capability.
- Confirm the SQL client is not using `.env.test.local` or disposable-project credentials.
- Save output to an access-controlled change record because query results contain customer,
  appointment, sale, payment, and receipt identifiers.

## Session safety gate

Before opening the SQL file, run these statements manually in the approved production session:

```sql
begin transaction read only;
set local statement_timeout = '30s';
set local lock_timeout = '2s';
select current_database(), current_user, inet_server_addr(), inet_server_port(), version();
```

Compare the identity row with the approved inventory. Stop on any mismatch. Then execute
`supabase/phase-1-3-read-only-verification.sql` with `ON_ERROR_STOP=1` inside the same transaction.
Finish with `rollback;` even though the transaction is read-only.

## Expected review

- Exactly one non-internal `auth.users` signup trigger should invoke
  `public.handle_new_user()`; capture its exact definition, function owner, `SECURITY DEFINER`
  state, `search_path`, and ACL for comparison with migration 002.
- Both `service-images` and `selected-work-images` buckets must be present. Record `public`, size,
  and MIME settings without changing them.
- Storage SELECT policies must be limited to the intended buckets. INSERT/UPDATE/DELETE policies
  must require an authenticated admin role. Treat policy names as descriptive only; review their
  actual `qual` and `with_check` expressions.
- Confirm RLS is enabled on every listed public table and compare all policy expressions.
- Confirm anonymous/authenticated EXECUTE is absent for server-only and trigger functions.
- Migration precondition queries for normalized customer-email duplicates and duplicate reward
  redemption links must return zero rows before the change window.
- Every financial anomaly query result is a manual-review candidate, not authorization to update
  data. In particular, a zero-tip refund is not automatically incorrect.
- After migrations 004/005, the listed constraints are expected to exist with
  `convalidated = false` until historical review is separately approved.

## Evidence and stop conditions

Record query start/end timestamps, row counts, reviewed IDs, reviewer disposition, and sanitized
policy/function definitions. Stop release preparation if:

- project/database identity is ambiguous;
- the Auth trigger or either Storage bucket/policy set differs from the definitions used in the
  disposable test environment;
- migration 001/004 precondition queries return rows;
- a public/customer policy exposes another customer's data or a server-only RPC;
- a financial anomaly could make new constraints or RPC behavior incompatible with existing data.

Do not correct returned records during verification. Reconciliation requires a separately reviewed,
audited forward-fix script and business approval.
