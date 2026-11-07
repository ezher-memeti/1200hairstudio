-- 1200 Hairstudio: reconcile database discount domains with current application writes.

begin;

-- PRECHECK (run separately):
-- select discount_source, count(*) from public.appointments group by discount_source order by 1;
-- select discount_type, count(*) from public.appointments group by discount_type order by 1;
-- select discount_source, count(*) from public.sales group by discount_source order by 1;

do $$
begin
  if exists (
    select 1 from public.appointments
    where discount_source is not null
      and discount_source not in ('promotion', 'custom', 'manual', 'loyalty')
  ) then
    raise exception 'appointments contains an unsupported discount_source';
  end if;

  if exists (
    select 1 from public.appointments
    where discount_type is not null
      and discount_type not in ('percentage', 'fixed', 'fixed_discount', 'free_service')
  ) then
    raise exception 'appointments contains an unsupported discount_type';
  end if;

  if exists (
    select 1 from public.sales
    where discount_source is not null
      and discount_source not in ('promotion', 'custom', 'manual', 'loyalty')
  ) then
    raise exception 'sales contains an unsupported discount_source';
  end if;
end
$$;

alter table public.appointments
  drop constraint if exists appointments_discount_source_check;
alter table public.appointments
  add constraint appointments_discount_source_check
  check (discount_source is null or discount_source in ('promotion', 'custom', 'manual', 'loyalty'));

alter table public.appointments
  drop constraint if exists appointments_discount_type_check;
alter table public.appointments
  add constraint appointments_discount_type_check
  check (discount_type is null or discount_type in ('percentage', 'fixed', 'fixed_discount', 'free_service'));

alter table public.sales
  drop constraint if exists sales_discount_source_check;
alter table public.sales
  add constraint sales_discount_source_check
  check (discount_source is null or discount_source in ('promotion', 'custom', 'manual', 'loyalty'));

commit;

-- POST-MIGRATION VERIFICATION:
-- select conname, pg_get_constraintdef(oid)
-- from pg_constraint
-- where conrelid in ('public.appointments'::regclass, 'public.sales'::regclass)
--   and conname in (
--     'appointments_discount_source_check',
--     'appointments_discount_type_check',
--     'sales_discount_source_check'
--   )
-- order by conname;

-- APPLICATION TESTS:
-- Promotion booking; fixed and percentage promotion; manual fixed and percentage checkout;
-- existing custom discount checkout; fixed_discount, percentage, and free_service loyalty paths.

-- ROLLBACK/FORWARD FIX:
-- Dropping these checks is technically reversible, but prefer a forward migration that expands or
-- normalizes the canonical vocabulary. Do not restore the previous checks while the current
-- application writes manual and loyalty values.

