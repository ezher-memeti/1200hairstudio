-- 1200 Hairstudio: settings singletons and reliable updated_at timestamps.

begin;

do $$
begin
  if (select count(*) from public.notification_settings) > 1 then
    raise exception 'notification_settings contains multiple rows';
  end if;
  if (select count(*) from public.loyalty_settings) > 1 then
    raise exception 'loyalty_settings contains multiple rows';
  end if;
  if (select count(*) from public.contact_section_settings) > 1 then
    raise exception 'contact_section_settings contains multiple rows';
  end if;
end
$$;

create unique index notification_settings_singleton
  on public.notification_settings ((true));
create unique index loyalty_settings_singleton
  on public.loyalty_settings ((true));
create unique index contact_section_settings_singleton
  on public.contact_section_settings ((true));

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'notification_settings'
      and policyname = 'Admins can insert notification settings'
  ) then
    create policy "Admins can insert notification settings"
      on public.notification_settings for insert to authenticated
      with check (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.role = 'admin'
        )
      );
  end if;
end
$$;

-- Use one trigger function for all public tables with an updated_at column.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

create or replace trigger announcements_set_updated_at before update on public.announcements
  for each row execute function public.set_updated_at();
create or replace trigger appointments_set_updated_at before update on public.appointments
  for each row execute function public.set_updated_at();
create or replace trigger availability_exceptions_set_updated_at before update on public.availability_exceptions
  for each row execute function public.set_updated_at();
create or replace trigger business_hours_set_updated_at before update on public.business_hours
  for each row execute function public.set_updated_at();
create or replace trigger contact_section_settings_set_updated_at before update on public.contact_section_settings
  for each row execute function public.set_updated_at();
create or replace trigger customer_email_logs_set_updated_at before update on public.customer_email_logs
  for each row execute function public.set_updated_at();
create or replace trigger customers_set_updated_at before update on public.customers
  for each row execute function public.set_updated_at();
create or replace trigger homepage_content_set_updated_at before update on public.homepage_content
  for each row execute function public.set_updated_at();
create or replace trigger loyalty_rewards_set_updated_at before update on public.loyalty_rewards
  for each row execute function public.set_updated_at();
create or replace trigger loyalty_settings_set_updated_at before update on public.loyalty_settings
  for each row execute function public.set_updated_at();
create or replace trigger marketing_campaigns_set_updated_at before update on public.marketing_campaigns
  for each row execute function public.set_updated_at();
create or replace trigger marketing_templates_set_updated_at before update on public.marketing_templates
  for each row execute function public.set_updated_at();
create or replace trigger notification_settings_set_updated_at before update on public.notification_settings
  for each row execute function public.set_updated_at();
create or replace trigger payments_set_updated_at before update on public.payments
  for each row execute function public.set_updated_at();
create or replace trigger promotions_set_updated_at before update on public.promotions
  for each row execute function public.set_updated_at();
create or replace trigger recurring_bookings_set_updated_at before update on public.recurring_bookings
  for each row execute function public.set_updated_at();
create or replace trigger register_sessions_set_updated_at before update on public.register_sessions
  for each row execute function public.set_updated_at();
create or replace trigger sales_set_updated_at before update on public.sales
  for each row execute function public.set_updated_at();
create or replace trigger selected_work_set_updated_at before update on public.selected_work
  for each row execute function public.set_updated_at();
create or replace trigger services_set_updated_at before update on public.services
  for each row execute function public.set_updated_at();

commit;

-- POST-MIGRATION VERIFICATION:
-- select indexname, indexdef from pg_indexes
-- where schemaname = 'public' and indexname like '%_singleton';
--
-- select event_object_table, trigger_name, action_statement
-- from information_schema.triggers
-- where trigger_schema = 'public' and trigger_name like '%_set_updated_at'
-- order by event_object_table;
--
-- select policyname, roles, cmd, with_check from pg_policies
-- where schemaname = 'public' and tablename = 'notification_settings';

-- COMPATIBILITY NOTE:
-- The application already treats these settings tables as singletons. The new indexes make that
-- assumption deterministic. The timestamp triggers replace inconsistent caller-managed updates.

