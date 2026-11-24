# Linked Supabase project read-only assessment

Date: 2026-11-02

No migration, test record, Auth user, Storage object, or database backup was created during this
assessment. No existing record was updated or deleted.

## Confirmed project identity

- Project ref: `rqavijckrxkecaxnyiex`
- Supabase project name: `1200hairstudio@gmail.com's Project`
- Organization: `gaxvqbrututdeeiyfchr`
- Region: `eu-west-1`
- Status: `ACTIVE_HEALTHY`
- PostgreSQL: `17.6.1.155` / engine 17
- Created: 2026-08-20
- The CLI-linked project ref, configured application URL hostname, and inspected project all match.

The Supabase API does not expose a formal environment label. The assertion that this is
“development” is therefore user-authorized context, not metadata independently provable from the
project itself.

## Existing data and configuration

Exact public row counts:

| Area | Existing rows |
|---|---:|
| Auth users / profiles / customers | 4 / 4 / 4 |
| Appointments / recurring bookings / conflicts | 2 / 3 / 0 |
| Loyalty settings / rewards / visits | 1 / 0 / 1 |
| Promotions / promotion customers | 2 / 0 |
| Sales / sale items / payments / receipts | 1 / 1 / 1 / 1 |
| Register sessions / movements | 2 / 0 |
| Financial reports | 0 |
| Services / selected work | 4 / 5 |
| Business hours / availability exceptions | 7 / 2 |
| Admin / notification / contact settings | 4 / 1 / 1 |
| Announcements / homepage content | 4 / 27 |
| Marketing templates / campaigns / recipients | 4 / 3 / 2 |
| Customer email logs / appointment reminders | 2 / 0 |

Auth signup is enabled; email/password is the only enabled external provider and anonymous Auth is
disabled. There are four Auth users. Counts align with four profiles, but count alignment alone does
not prove trigger definition or one-to-one IDs.

Storage contains two public buckets:

- `service-images`: one root entry, `image/*` MIME restriction, no bucket-specific size limit.
- `selected-work-images`: one root entry, no MIME restriction, no bucket-specific size limit.

The tests use UUID-prefixed paths and cleanup only paths recorded by the current run. Existing files
must not be renamed, overwritten, or removed.

Current active service configuration is CHF 20, CHF 25, CHF 35, and CHF 40 with localized names.
The POS suite previously assumed English names; it has been changed to select active seed services
by the expected prices without modifying service rows. There is no open register session.

## Read-only RLS behavior

Anonymous reads returned zero rows for customers, appointments, loyalty rewards/visits, sales,
payments, and receipts. PostgREST represents RLS filtering as an empty result rather than a denial,
so this confirms no rows were exposed but does not prove the exact policy expression. Anonymous
reads returned all four active services and all five active selected-work rows as intended.

Exact live `pg_policies` expressions and the `auth.users` trigger definition were not independently
queried because no safe arbitrary-SQL read channel is available through the current CLI setup
without first establishing the database backup/dump tooling. The supplied schema baseline records
the public policies/function, while migration 002 contains a fail-closed trigger precondition. The
exact trigger and Storage policy definitions remain approval gates before migration execution.

## Migration and data preconditions

Read-only checks returned:

- duplicate normalized customer emails: 0
- overlapping confirmed appointment pairs: 0
- duplicate reward redemption appointment links: 0
- loyalty settings rows: exactly 1
- open register sessions: 0
- legacy appointment `custom` / `fixed_discount` values: 0
- invalid reward values: 0
- inconsistent sale totals: 0
- invalid payment tips: 0
- completed zero-tip refunds: 0
- inconsistent receipt totals: 0

Migration dependency review:

1. `001` adds normalized-email uniqueness and overlap protection. Current data passes its known
   duplicate/overlap gates.
2. `002` requires an existing non-internal `auth.users` trigger invoking
   `public.handle_new_user()`. This must be verified exactly; the migration aborts if absent.
3. `003` depends on the trusted RPCs from 002 and removes legacy customer write paths/EXECUTE
   grants. The compatible application must accompany it.
4. `004` adds loyalty linkage and the new checkout signature. No existing reward links can collide.
5. `005` depends on 004, drops the legacy checkout signature, and adds `NOT VALID` financial
   constraints without rewriting historical records.

All five files are transactional. Recorded SHA-256 checksums:

- 001: `f7ef3bd8c43bfab6d4efd557c6720f756e53f29d3f4977f97fea4a7cf2a60bb7`
- 002: `8a04c1c9c607b42af0e3e763940ef7b8f35ea703b636a6d72d8d284f7651883d`
- 003: `04a35558bdb96e2d94d744e97a3f8e9fb839d95ae11ce695dca44dbaf3dad71a`
- 004: `1c93624e7ec5d410d6a2086a9db6a6754f716d5b697e90b5fdf3e3170d8632e8`
- 005: `a6b181df8cf8de077972aee51ffbe3772a978b62f77fd51e131d3e0395073b5f`

The remote migration-history table is empty even though the database already contains the older
schema. Therefore `supabase migration up --linked` or `db push` must not be used: either could try
to apply older local migrations or create a conflicting history. The approved execution must target
only the five reviewed files explicitly and then reconcile migration history deliberately.

## Backup status and proposed backup

Supabase reports WAL-G capability, PITR disabled, and no available managed backups. There is no
currently verified recovery point.

Before migrations, create a logical backup containing roles, full schema (including Auth/Storage
metadata), and data. Store it outside the repository with restrictive permissions, record SHA-256
checksums, and restore it into a temporary PostgreSQL 17 database to verify readability and object/
row counts. Storage database metadata does not contain the binary objects themselves; separately
inventory/download the two existing objects or confirm they are reproducible before proceeding.

This backup step is read-only to the source but creates sensitive local files and may require
installing/using PostgreSQL client tooling. It has not been performed pending approval and selection
of a secure backup destination.

## Suite authorization and expected mutations

The suites still refuse the linked project by default. To authorize only this project, they require
all of the existing remote-test gates plus:

```text
SUPABASE_TEST_PROJECT_REF=rqavijckrxkecaxnyiex
SUPABASE_TEST_LINKED_PROJECT_AUTHORIZATION=ALLOW_PHASE_1_3_TESTING:rqavijckrxkecaxnyiex
```

Expected temporary mutations after migrations:

- Auth: test customer/admin users with UUID-marked `.invalid` emails.
- Public data: UUID-marked customers, appointments, services, promotions, loyalty rewards/visits,
  sales, sale items, payments/refunds, receipts, register session/movements, and related rows.
- Storage: one UUID-marked PNG path in each bucket.

Cleanup is ID/marker scoped and verifies deletion. Risks remain if a process is interrupted, cleanup
encounters a newly tightened dependency, email/reminder automation observes test rows, or the POS
suite interacts with a concurrently opened register. Automated email/reminder processing should be
paused for the test window, no admin/customer UI writes should occur concurrently, and pre/post
counts plus marker searches must be retained as evidence.

## Approval gate

No database mutation has occurred. Approval is requested for the next stage only after:

1. choosing a secure backup destination;
2. producing and restore-verifying the backup;
3. verifying the exact Auth trigger and Storage policy definitions;
4. re-running preconditions immediately before migration;
5. applying only 001-005 in order;
6. running the three marker-scoped suites and cleanup verification.
