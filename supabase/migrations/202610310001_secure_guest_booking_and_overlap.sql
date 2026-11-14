-- Phase 1: secure guest identity resolution and atomically prevent confirmed overlaps.
-- Apply only after the preflight queries below return no rows.

begin;

do $$
begin
  if exists (
    select 1 from public.customers
    group by lower(trim(email))
    having count(*) > 1
  ) then
    raise exception 'Duplicate normalized customer emails exist; reconcile them before applying Phase 1';
  end if;
end
$$;

create unique index if not exists customers_email_normalized_unique
  on public.customers (lower(trim(email)));

-- PRECHECK (run before this migration):
-- select lower(email), count(*) from public.customers
-- group by lower(email) having count(*) > 1;
-- select a.id, b.id from public.appointments a join public.appointments b
--   on a.id < b.id and a.status = 'confirmed' and b.status = 'confirmed'
--  and tstzrange(a.start_at, a.end_at, '[)') && tstzrange(b.start_at, b.end_at, '[)');

create or replace function public.get_or_create_guest_customer(
  p_full_name text,
  p_email text,
  p_phone text default null,
  p_marketing_consent boolean default false
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_is_registered boolean;
  v_profile_id uuid;
  v_email text := lower(trim(p_email));
  v_name text := trim(p_full_name);
  v_phone text := nullif(trim(p_phone), '');
begin
  if v_email is null or v_email = '' or length(v_email) > 320 then
    raise exception using errcode = '22023', message = 'A valid email is required';
  end if;
  if v_name is null or v_name = '' or length(v_name) > 200 then
    raise exception using errcode = '22023', message = 'A valid name is required';
  end if;
  if v_phone is not null and length(v_phone) > 50 then
    raise exception using errcode = '22023', message = 'Phone number is too long';
  end if;

  -- Serialize resolution by normalized email. Email knowledge never authorizes mutation.
  perform pg_advisory_xact_lock(hashtextextended(v_email, 1200));

  select id, is_registered, profile_id
  into v_customer_id, v_is_registered, v_profile_id
  from public.customers
  where lower(trim(email)) = v_email
  limit 1
  for update;

  if v_customer_id is not null then
    if v_is_registered or v_profile_id is not null then
      raise exception using
        errcode = '42501',
        message = 'An account already exists for this email';
    end if;
    return v_customer_id;
  end if;

  insert into public.customers (
    full_name, email, phone, profile_id, is_registered,
    marketing_email_consent, marketing_email_consented_at,
    marketing_email_unsubscribed_at, marketing_email_consent_source
  ) values (
    v_name, v_email, v_phone, null, false,
    p_marketing_consent,
    case when p_marketing_consent then now() else null end,
    null,
    case when p_marketing_consent then 'booking_form' else null end
  ) returning id into v_customer_id;

  return v_customer_id;
end
$$;

revoke all on function public.get_or_create_guest_customer(text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.get_or_create_guest_customer(text, text, text, boolean)
  to service_role;

do $$
begin
  if exists (
    select 1 from public.appointments a join public.appointments b
      on a.id < b.id and a.status = 'confirmed' and b.status = 'confirmed'
     and tstzrange(a.start_at, a.end_at, '[)') && tstzrange(b.start_at, b.end_at, '[)')
  ) then
    raise exception 'Confirmed appointment overlaps exist; resolve them before applying this migration';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.appointments'::regclass
      and conname = 'appointments_no_confirmed_overlap'
  ) then
    alter table public.appointments
      add constraint appointments_no_confirmed_overlap
      exclude using gist (tstzrange(start_at, end_at, '[)') with &&)
      where (status = 'confirmed');
  end if;
end
$$;

commit;

-- POST-MIGRATION VERIFICATION:
-- select has_function_privilege('anon',
--   'public.get_or_create_guest_customer(text,text,text,boolean)', 'execute') as anon_can_execute,
--   has_function_privilege('authenticated',
--   'public.get_or_create_guest_customer(text,text,text,boolean)', 'execute') as authenticated_can_execute,
--   has_function_privilege('service_role',
--   'public.get_or_create_guest_customer(text,text,text,boolean)', 'execute') as service_can_execute;
-- select conname, contype, convalidated, pg_get_constraintdef(oid)
-- from pg_constraint where conrelid = 'public.appointments'::regclass
-- and conname = 'appointments_no_confirmed_overlap';

-- FORWARD FIX / EMERGENCY ROLLBACK:
-- Prefer correcting application incompatibilities while retaining both protections.
-- If necessary, pause booking writes before dropping appointments_no_confirmed_overlap.
-- Do not restore browser execution of the previous customer-mutating RPC.
