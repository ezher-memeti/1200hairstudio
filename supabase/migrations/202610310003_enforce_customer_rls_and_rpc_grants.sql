-- Phase 2B enforcement. Apply only after the compatible application version is deployed.

begin;

do $$
begin
  if to_regprocedure('public.get_my_customer()') is null
     or to_regprocedure('public.ensure_my_customer(text,text)') is null
     or to_regprocedure('public.update_my_customer_profile(text,text)') is null
     or to_regprocedure('public.set_my_marketing_email_preference(boolean,text)') is null then
    raise exception 'Phase 2A trusted customer operations must exist before enforcement';
  end if;
end
$$;

drop policy if exists "TEMP test services read" on public.services;

-- Remove broad customer-row access and direct write paths. Admin policies remain unchanged.
drop policy if exists "Customers can read own record" on public.customers;
drop policy if exists "Customers can update own record" on public.customers;
drop policy if exists "Customers can create own appointments" on public.appointments;
drop policy if exists "Customers can create own recurring bookings" on public.recurring_bookings;
drop policy if exists "Customers can update own recurring bookings" on public.recurring_bookings;

drop policy if exists "Customers can read own appointments" on public.appointments;
create policy "Customers can read own appointments" on public.appointments
for select to authenticated using (customer_id = public.current_customer_id());

drop policy if exists "Customers can view own recurring bookings" on public.recurring_bookings;
create policy "Customers can view own recurring bookings" on public.recurring_bookings
for select to authenticated using (customer_id = public.current_customer_id());

drop policy if exists "Customers can view own loyalty rewards" on public.loyalty_rewards;
create policy "Customers can view own loyalty rewards" on public.loyalty_rewards
for select to authenticated using (customer_id = public.current_customer_id());

drop policy if exists "Customers can view own loyalty visits" on public.loyalty_visits;
create policy "Customers can view own loyalty visits" on public.loyalty_visits
for select to authenticated using (customer_id = public.current_customer_id());

revoke all on function public.create_guest_appointment(uuid, uuid, timestamptz, timestamptz, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_guest_appointment(uuid, uuid, timestamptz, timestamptz, text, text, text)
  to service_role;
revoke all on function public.get_my_available_promotions(uuid) from public, anon;
grant execute on function public.get_my_available_promotions(uuid) to authenticated, service_role;
revoke all on function public.complete_pos_checkout(uuid, numeric, numeric, text, text, numeric, text, uuid, numeric, numeric, numeric, numeric, jsonb)
  from public, anon;
revoke all on function public.refund_pos_sale(uuid, numeric, text, text) from public, anon;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.update_admin_settings_updated_at() from public, anon, authenticated;
revoke all on function public.update_payments_updated_at() from public, anon, authenticated;

alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema public grant execute on functions to service_role;

commit;

-- POST-MIGRATION VERIFICATION (read-only):
-- select policyname, roles, cmd, qual, with_check from pg_policies
-- where schemaname = 'public' order by tablename, policyname;
-- select n.nspname, p.proname, p.prosecdef, p.proconfig, p.proacl
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' order by p.proname;
-- select id, public, file_size_limit, allowed_mime_types from storage.buckets
-- where id in ('service-images', 'selected-work-images');
-- select policyname, roles, cmd, qual, with_check from pg_policies
-- where schemaname = 'storage' and tablename = 'objects' order by policyname;
-- Storage is intentionally not modified because it is outside the supplied public-schema baseline.
