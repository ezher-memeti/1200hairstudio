-- 1200 Hairstudio: atomic one-barber appointment overlap protection.
-- Booking writes must be paused while this constraint is created.

begin;

-- PRECHECK (run separately and retain output):
-- select a.id as appointment_a, b.id as appointment_b,
--        a.start_at as a_start, a.end_at as a_end,
--        b.start_at as b_start, b.end_at as b_end
-- from public.appointments a
-- join public.appointments b
--   on a.id < b.id
--  and a.status = 'confirmed'
--  and b.status = 'confirmed'
--  and tstzrange(a.start_at, a.end_at, '[)') && tstzrange(b.start_at, b.end_at, '[)')
-- order by a.start_at;

do $$
begin
  if exists (
    select 1
    from public.appointments a
    join public.appointments b
      on a.id < b.id
     and a.status = 'confirmed'
     and b.status = 'confirmed'
     and tstzrange(a.start_at, a.end_at, '[)') && tstzrange(b.start_at, b.end_at, '[)')
  ) then
    raise exception 'Confirmed appointment overlaps exist; resolve them before adding exclusion protection';
  end if;
end
$$;

alter table public.appointments
  add constraint appointments_no_confirmed_overlap
  exclude using gist (
    tstzrange(start_at, end_at, '[)') with &&
  )
  where (status = 'confirmed');

commit;

-- POST-MIGRATION VERIFICATION:
-- select conname, contype, convalidated, pg_get_constraintdef(oid)
-- from pg_constraint
-- where conrelid = 'public.appointments'::regclass
--   and conname = 'appointments_no_confirmed_overlap';

-- CONCURRENCY TEST:
-- From two independent transactions, attempt to insert overlapping confirmed appointments. One
-- must fail with exclusion_violation (SQLSTATE 23P01). Adjacent [start,end) appointments must pass.

-- COMPATIBILITY NOTE:
-- This expresses the current single-barber/single-chair model. Before adding multiple simultaneous
-- resources, replace it with an exclusion key that includes barber_id/chair_id/resource_id.

-- EMERGENCY ROLLBACK:
-- alter table public.appointments drop constraint appointments_no_confirmed_overlap;
-- Only do this with booking writes paused. Prefer a forward fix for any application error mapping.

