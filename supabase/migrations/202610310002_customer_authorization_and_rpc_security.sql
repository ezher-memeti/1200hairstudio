-- Phase 2A: add trusted customer operations and harden the Auth signup function.
-- Depends on 202610310001_secure_guest_booking_and_overlap.sql.

begin;

do $$
begin
  if has_function_privilege(
    'anon',
    'public.get_or_create_guest_customer(text,text,text,boolean)',
    'execute'
  ) or not exists (
    select 1 from pg_constraint
    where conrelid = 'public.appointments'::regclass
      and conname = 'appointments_no_confirmed_overlap'
  ) then
    raise exception 'Phase 1 security migration must be applied before Phase 2';
  end if;
end
$$;

-- Resolve ownership without granting customers SELECT access to sensitive customer columns.
create or replace function public.current_customer_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.id
  from public.customers c
  join public.profiles p on p.id = c.profile_id
  where c.profile_id = auth.uid() and p.role = 'customer'
  limit 1
$$;

revoke all on function public.current_customer_id() from public, anon;
grant execute on function public.current_customer_id() to authenticated, service_role;

create or replace function public.get_my_customer()
returns table (
  id uuid, profile_id uuid, full_name text, email text, phone text,
  created_at timestamptz, updated_at timestamptz, is_registered boolean,
  marketing_email_consent boolean, marketing_email_consented_at timestamptz,
  marketing_email_unsubscribed_at timestamptz, marketing_email_consent_source text
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.profile_id, c.full_name, c.email, c.phone,
         c.created_at, c.updated_at, c.is_registered,
         c.marketing_email_consent, c.marketing_email_consented_at,
         c.marketing_email_unsubscribed_at, c.marketing_email_consent_source
  from public.customers c
  join public.profiles p on p.id = c.profile_id
  where c.profile_id = auth.uid() and p.role = 'customer'
  limit 1
$$;

create or replace function public.ensure_my_customer(
  p_full_name text default null,
  p_phone text default null
)
returns table (
  id uuid, profile_id uuid, full_name text, email text, phone text,
  created_at timestamptz, updated_at timestamptz, is_registered boolean,
  marketing_email_consent boolean, marketing_email_consented_at timestamptz,
  marketing_email_unsubscribed_at timestamptz, marketing_email_consent_source text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_name text := nullif(trim(p_full_name), '');
  v_phone text := nullif(trim(p_phone), '');
  v_customer public.customers%rowtype;
begin
  if v_uid is null or not exists (
    select 1 from public.profiles p where p.id = v_uid and p.role = 'customer'
  ) then
    raise exception using errcode = '42501', message = 'Unauthorized';
  end if;
  select lower(trim(coalesce(u.email, ''))) into v_email
  from auth.users u where u.id = v_uid;
  if coalesce(v_email, '') = '' then
    raise exception using errcode = '22023', message = 'Authenticated email is required';
  end if;
  if v_name is not null and length(v_name) > 200 then
    raise exception using errcode = '22023', message = 'Name is too long';
  end if;
  if v_phone is not null and length(v_phone) > 50 then
    raise exception using errcode = '22023', message = 'Phone number is too long';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_email, 1200));
  select c.* into v_customer
  from public.customers c
  where c.profile_id = v_uid or lower(trim(c.email)) = v_email
  order by (c.profile_id = v_uid) desc
  limit 1
  for update;

  if found then
    if v_customer.profile_id is not null and v_customer.profile_id <> v_uid then
      raise exception using errcode = '23505', message = 'Email is already linked to another account';
    end if;
    update public.customers c
    set profile_id = v_uid,
        is_registered = true,
        full_name = coalesce(v_name, c.full_name),
        phone = coalesce(v_phone, c.phone),
        updated_at = now()
    where c.id = v_customer.id;
  else
    insert into public.customers (profile_id, full_name, email, phone, is_registered)
    values (v_uid, coalesce(v_name, v_email), v_email, v_phone, true);
  end if;

  return query select * from public.get_my_customer();
end
$$;

create or replace function public.update_my_customer_profile(p_full_name text, p_phone text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := trim(p_full_name);
  v_phone text := nullif(trim(p_phone), '');
begin
  if v_name is null or v_name = '' or length(v_name) > 200 then
    raise exception using errcode = '22023', message = 'A valid name is required';
  end if;
  if v_phone is not null and length(v_phone) > 50 then
    raise exception using errcode = '22023', message = 'Phone number is too long';
  end if;
  update public.customers
  set full_name = v_name, phone = v_phone, updated_at = now()
  where id = public.current_customer_id();
  if not found then raise exception using errcode = '42501', message = 'Unauthorized'; end if;
end
$$;

create or replace function public.set_my_marketing_email_preference(
  p_subscribed boolean,
  p_source text default 'account_preferences'
)
returns table (
  marketing_email_consent boolean,
  marketing_email_consented_at timestamptz,
  marketing_email_consent_source text,
  marketing_email_unsubscribed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_source not in ('account_preferences', 'signup_form', 'booking_form') then
    raise exception using errcode = '22023', message = 'Invalid consent source';
  end if;
  update public.customers c
  set marketing_email_consent = p_subscribed,
      marketing_email_consented_at = case when p_subscribed then now() else c.marketing_email_consented_at end,
      marketing_email_consent_source = case when p_subscribed then p_source else c.marketing_email_consent_source end,
      marketing_email_unsubscribed_at = case when p_subscribed then null else now() end,
      updated_at = now()
  where c.id = public.current_customer_id();
  if not found then raise exception using errcode = '42501', message = 'Unauthorized'; end if;

  return query
  select c.marketing_email_consent, c.marketing_email_consented_at,
         c.marketing_email_consent_source, c.marketing_email_unsubscribed_at
  from public.customers c where c.id = public.current_customer_id();
end
$$;

revoke all on function public.get_my_customer() from public, anon;
revoke all on function public.ensure_my_customer(text, text) from public, anon;
revoke all on function public.update_my_customer_profile(text, text) from public, anon;
revoke all on function public.set_my_marketing_email_preference(boolean, text) from public, anon;
grant execute on function public.get_my_customer() to authenticated, service_role;
grant execute on function public.ensure_my_customer(text, text) to authenticated, service_role;
grant execute on function public.update_my_customer_profile(text, text) to authenticated, service_role;
grant execute on function public.set_my_marketing_email_preference(boolean, text) to authenticated, service_role;

-- Auth signup safely claims an existing guest row instead of failing on customers.email.
do $$
begin
  if not exists (
    select 1
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'auth' and c.relname = 'users'
      and p.proname = 'handle_new_user' and not t.tgisinternal
  ) then
    raise exception 'Expected auth.users signup trigger using public.handle_new_user() was not found';
  end if;
end
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(new.email));
  v_customer public.customers%rowtype;
begin
  insert into public.profiles (id, role) values (new.id, 'customer')
  on conflict (id) do nothing;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_email, 1200));
  select c.* into v_customer from public.customers c
  where c.profile_id = new.id or lower(trim(c.email)) = v_email
  order by (c.profile_id = new.id) desc limit 1 for update;

  if found then
    if v_customer.profile_id is not null and v_customer.profile_id <> new.id then
      raise exception 'Customer email is already linked to another account';
    end if;
    update public.customers c
    set profile_id = new.id,
        is_registered = true,
        full_name = case when nullif(c.full_name, '') is null
          then coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), v_email)
          else c.full_name end,
        phone = coalesce(c.phone, nullif(trim(new.raw_user_meta_data ->> 'phone'), '')),
        updated_at = now()
    where c.id = v_customer.id;
  else
    insert into public.customers (profile_id, full_name, email, phone, is_registered)
    values (new.id,
      coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), v_email),
      v_email, nullif(trim(new.raw_user_meta_data ->> 'phone'), ''), true);
  end if;
  return new;
end
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

commit;

-- Verify the trusted functions and Auth trigger before deploying the compatible application.
-- select t.tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid
-- join pg_namespace n on n.oid=c.relnamespace join pg_proc p on p.oid=t.tgfoid
-- where n.nspname='auth' and c.relname='users' and p.proname='handle_new_user' and not t.tgisinternal;
