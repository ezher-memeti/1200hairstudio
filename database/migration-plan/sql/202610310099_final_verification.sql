-- 1200 Hairstudio final migration verification
-- Read-only: this file intentionally contains no DDL or DML.

-- Object counts and RLS coverage.
select count(*) as public_tables
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE';

select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;

-- No temporary service policy remains.
select policyname, roles, cmd, qual
from pg_policies
where schemaname = 'public' and tablename = 'services'
order by policyname;

-- Required extensions, Auth trigger, and Storage buckets.
select extname, extnamespace::regnamespace
from pg_extension
where extname in ('pgcrypto', 'btree_gist')
order by extname;

select t.tgname, t.tgfoid::regprocedure
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'auth' and c.relname = 'users' and not t.tgisinternal;

select id, name, public
from storage.buckets
where id in ('service-images', 'selected-work-images')
order by id;

-- Function exposure.
select
  has_function_privilege('anon',
    'public.get_or_create_guest_customer(text,text,text,boolean)', 'execute') as anon_guest_customer,
  has_function_privilege('anon',
    'public.create_guest_appointment(uuid,uuid,timestamptz,timestamptz,text,text,text)', 'execute') as anon_legacy_guest_appointment,
  has_function_privilege('anon',
    'public.complete_pos_checkout(uuid,numeric,numeric,text,text,numeric,text,uuid,numeric,numeric,numeric,numeric,jsonb)', 'execute') as anon_checkout,
  has_function_privilege('authenticated',
    'public.complete_pos_checkout(uuid,numeric,numeric,text,text,numeric,text,uuid,numeric,numeric,numeric,numeric,jsonb)', 'execute') as authenticated_checkout;

-- Constraints added by this plan.
select conrelid::regclass as table_name, conname, contype, convalidated,
       pg_get_constraintdef(oid) as definition
from pg_constraint
where conname in (
  'appointments_discount_source_check',
  'appointments_discount_type_check',
  'sales_discount_source_check',
  'appointments_no_confirmed_overlap',
  'services_name_not_blank',
  'services_price_nonnegative',
  'services_duration_min_positive',
  'services_duration_range_valid',
  'appointments_financial_values_nonnegative',
  'promotions_discount_value_valid',
  'promotions_date_range_valid',
  'loyalty_settings_values_valid',
  'loyalty_rewards_value_nonnegative',
  'announcements_date_range_valid',
  'recurring_bookings_date_range_valid',
  'recurring_bookings_occurrence_count_valid',
  'profiles_role_check'
)
order by table_name::text, conname;

-- Data invariants expected to return zero rows/counts.
select a.id as appointment_a, b.id as appointment_b
from public.appointments a
join public.appointments b
  on a.id < b.id
 and a.status = 'confirmed'
 and b.status = 'confirmed'
 and tstzrange(a.start_at, a.end_at, '[)') && tstzrange(b.start_at, b.end_at, '[)');

select lower(btrim(email)) as normalized_email, count(*)
from public.customers
group by lower(btrim(email))
having count(*) > 1;

select lower(btrim(name)) as normalized_name, count(*)
from public.services
group by lower(btrim(name))
having count(*) > 1;

select
  (select count(*) from public.notification_settings) as notification_settings_rows,
  (select count(*) from public.loyalty_settings) as loyalty_settings_rows,
  (select count(*) from public.contact_section_settings) as contact_settings_rows;

-- Foreign keys without a usable leading-column index. Expected to return no high-value omissions;
-- expression and partial indexes should be reviewed manually.
with foreign_keys as (
  select conrelid, conname, conkey
  from pg_constraint
  where contype = 'f' and connamespace = 'public'::regnamespace
)
select fk.conrelid::regclass as table_name, fk.conname
from foreign_keys fk
where not exists (
  select 1
  from pg_index i
  where i.indrelid = fk.conrelid
    and i.indisvalid
    and (i.indkey::smallint[])[0:cardinality(fk.conkey)-1] = fk.conkey
)
order by table_name::text, fk.conname;

-- Timestamp triggers.
select event_object_table, trigger_name
from information_schema.triggers
where trigger_schema = 'public' and trigger_name like '%_set_updated_at'
order by event_object_table;

