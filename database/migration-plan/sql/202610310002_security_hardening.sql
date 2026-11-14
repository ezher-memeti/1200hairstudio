-- 1200 Hairstudio: confirmed security findings
-- Keeps the existing guest RPC signature for application compatibility.

begin;

drop policy if exists "TEMP test services read" on public.services;

-- The application resolves guest identity only through its server-side service-role client.
-- Existing rows are reused without mutation; email knowledge is never treated as authorization.
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
  v_customer public.customers%rowtype;
  v_customer_id uuid;
  v_email text := lower(trim(p_email));
  v_name text := trim(p_full_name);
  v_phone text := nullif(trim(p_phone), '');
begin
  if v_email is null or v_email = '' or length(v_email) > 320 then
    raise exception 'A valid email is required';
  end if;

  if v_name is null or v_name = '' or length(v_name) > 200 then
    raise exception 'A valid name is required';
  end if;

  if v_phone is not null and length(v_phone) > 50 then
    raise exception 'Phone number is too long';
  end if;

  -- Serialize guest creation for the normalized email to avoid duplicate races.
  perform pg_advisory_xact_lock(hashtextextended(v_email, 1200));

  select *
  into v_customer
  from public.customers
  where lower(email) = v_email
  limit 1
  for update;

  if found then
    if v_customer.is_registered or v_customer.profile_id is not null then
      raise exception using
        errcode = '42501',
        message = 'An account already exists for this email';
    end if;

    -- Deliberately return the existing guest without mutating customer data.
    return v_customer.id;
  end if;

  insert into public.customers (
    full_name,
    email,
    phone,
    profile_id,
    is_registered,
    marketing_email_consent,
    marketing_email_consented_at,
    marketing_email_unsubscribed_at,
    marketing_email_consent_source
  ) values (
    v_name,
    v_email,
    v_phone,
    null,
    false,
    p_marketing_consent,
    case when p_marketing_consent then now() else null end,
    null,
    case when p_marketing_consent then 'booking_form' else null end
  )
  returning id into v_customer_id;

  return v_customer_id;
end
$$;

revoke all on function public.get_or_create_guest_customer(text, text, text, boolean) from public;
grant execute on function public.get_or_create_guest_customer(text, text, text, boolean)
  to service_role;

-- The current application does not call this legacy RPC. Retain it for rollback safety, but remove
-- browser access so it cannot be used as a second booking implementation.
revoke all on function public.create_guest_appointment(uuid, uuid, timestamptz, timestamptz, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_guest_appointment(uuid, uuid, timestamptz, timestamptz, text, text, text)
  to service_role;

-- Admin RPCs perform their own role check, but anonymous execution is unnecessary.
revoke all on function public.complete_pos_checkout(uuid, numeric, numeric, text, text, numeric, text, uuid, numeric, numeric, numeric, numeric, jsonb)
  from public, anon;
revoke all on function public.refund_pos_sale(uuid, numeric, text, text)
  from public, anon;

-- Trigger functions must be invoked by triggers, not through the Data API.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.update_admin_settings_updated_at() from public, anon, authenticated;
revoke all on function public.update_payments_updated_at() from public, anon, authenticated;

commit;

-- POST-MIGRATION VERIFICATION:
-- select policyname, roles, cmd, qual
-- from pg_policies where schemaname = 'public' and tablename = 'services';
--
-- select has_function_privilege('anon',
--   'public.get_or_create_guest_customer(text,text,text,boolean)', 'execute') as guest_rpc,
--   has_function_privilege('anon',
--   'public.create_guest_appointment(uuid,uuid,timestamptz,timestamptz,text,text,text)', 'execute') as legacy_booking_rpc,
--   has_function_privilege('anon',
--   'public.complete_pos_checkout(uuid,numeric,numeric,text,text,numeric,text,uuid,numeric,numeric,numeric,numeric,jsonb)', 'execute') as checkout_rpc;

-- TESTS REQUIRED:
-- 1. Service-role new guest email creates one guest customer; browser roles are denied.
-- 2. Reusing that guest email returns the same id without changing stored customer fields.
-- 3. A registered email is rejected and leaves the row unchanged.
-- 4. Guest booking through the existing server action still succeeds for new/existing guests.

-- FORWARD-FIX GUIDANCE:
-- Do not restore anonymous updates to existing customers. If guest re-consent is required, add a
-- token-verified or authenticated server-side flow in a later application/database change.
