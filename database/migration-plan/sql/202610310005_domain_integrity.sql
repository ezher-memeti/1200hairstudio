-- 1200 Hairstudio: restore and add confirmed domain-integrity protections.

begin;

-- PRECHECKS are enforced again in the DO block so the migration fails without changing data.
do $$
begin
  if exists (
    select lower(btrim(name)) from public.services
    group by lower(btrim(name)) having count(*) > 1
  ) then raise exception 'Duplicate normalized service names exist'; end if;

  if exists (
    select 1 from public.services
    where btrim(name) = '' or price < 0 or duration_min <= 0
       or (duration_max is not null and duration_max < duration_min)
  ) then raise exception 'Invalid service name, price, or duration exists'; end if;

  if exists (
    select lower(btrim(email)) from public.customers
    group by lower(btrim(email)) having count(*) > 1
  ) then raise exception 'Duplicate normalized customer emails exist'; end if;

  if exists (
    select 1 from public.appointments
    where coalesce(original_price, 0) < 0
       or coalesce(discount_amount, 0) < 0
       or coalesce(final_price, 0) < 0
       or coalesce(discount_value, 0) < 0
  ) then raise exception 'Negative appointment financial values exist'; end if;

  if exists (
    select 1 from public.promotions
    where discount_value <= 0
       or (discount_type = 'percentage' and discount_value > 100)
       or (starts_at is not null and expires_at is not null and expires_at <= starts_at)
  ) then raise exception 'Invalid promotion value or date range exists'; end if;

  if exists (
    select 1 from public.loyalty_settings
    where visits_required <= 0 or reward_value < 0
       or (reward_expiry_days is not null and reward_expiry_days <= 0)
  ) then raise exception 'Invalid loyalty settings exist'; end if;

  if exists (
    select 1 from public.loyalty_rewards where reward_value < 0
  ) then raise exception 'Negative loyalty reward values exist'; end if;

  if exists (
    select 1 from public.announcements
    where starts_at is not null and expires_at is not null and expires_at <= starts_at
  ) then raise exception 'Invalid announcement date ranges exist'; end if;

  if exists (
    select 1 from public.recurring_bookings
    where ends_on is not null and ends_on < starts_on
       or total_occurrences is not null and total_occurrences < 0
  ) then raise exception 'Invalid recurring booking dates or occurrence counts exist'; end if;

  if exists (
    select 1 from public.profiles where role not in ('customer', 'admin')
  ) then raise exception 'Unsupported profile roles exist'; end if;
end
$$;

create unique index services_name_normalized_unique
  on public.services (lower(btrim(name)));
create unique index customers_email_normalized_unique
  on public.customers (lower(btrim(email)));

alter table public.services
  add constraint services_name_not_blank check (btrim(name) <> ''),
  add constraint services_price_nonnegative check (price >= 0),
  add constraint services_duration_min_positive check (duration_min > 0),
  add constraint services_duration_range_valid
    check (duration_max is null or duration_max >= duration_min);

alter table public.appointments
  add constraint appointments_financial_values_nonnegative check (
    coalesce(original_price, 0) >= 0
    and coalesce(discount_amount, 0) >= 0
    and coalesce(final_price, 0) >= 0
    and coalesce(discount_value, 0) >= 0
  );

alter table public.promotions
  add constraint promotions_discount_value_valid check (
    discount_value > 0
    and (discount_type <> 'percentage' or discount_value <= 100)
  ),
  add constraint promotions_date_range_valid check (
    starts_at is null or expires_at is null or expires_at > starts_at
  );

alter table public.loyalty_settings
  add constraint loyalty_settings_values_valid check (
    visits_required > 0
    and reward_value >= 0
    and (reward_expiry_days is null or reward_expiry_days > 0)
  );

alter table public.loyalty_rewards
  add constraint loyalty_rewards_value_nonnegative check (reward_value >= 0);

alter table public.announcements
  add constraint announcements_date_range_valid check (
    starts_at is null or expires_at is null or expires_at > starts_at
  );

alter table public.recurring_bookings
  add constraint recurring_bookings_date_range_valid check (
    ends_on is null or ends_on >= starts_on
  ),
  add constraint recurring_bookings_occurrence_count_valid check (
    total_occurrences is null or total_occurrences >= 0
  );

alter table public.profiles
  add constraint profiles_role_check check (role in ('customer', 'admin'));

commit;

-- POST-MIGRATION VERIFICATION:
-- select indexname, indexdef from pg_indexes
-- where schemaname = 'public'
--   and indexname in ('services_name_normalized_unique', 'customers_email_normalized_unique');
--
-- select conrelid::regclass as table_name, conname, convalidated,
--        pg_get_constraintdef(oid) as definition
-- from pg_constraint
-- where conname in (
--   'services_name_not_blank', 'services_price_nonnegative',
--   'services_duration_min_positive', 'services_duration_range_valid',
--   'appointments_financial_values_nonnegative', 'promotions_discount_value_valid',
--   'promotions_date_range_valid', 'loyalty_settings_values_valid',
--   'loyalty_rewards_value_nonnegative', 'announcements_date_range_valid',
--   'recurring_bookings_date_range_valid',
--   'recurring_bookings_occurrence_count_valid', 'profiles_role_check'
-- ) order by table_name::text, conname;

-- FORWARD-FIX GUIDANCE:
-- If a precheck fails, create a separate reviewed data-repair migration. Do not add automatic
-- deduplication here: service/customer merges have business and privacy consequences.

