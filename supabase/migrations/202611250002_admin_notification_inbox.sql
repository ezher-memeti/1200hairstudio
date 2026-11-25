begin;
-- Track the existing inbox schema without modifying any push table or generating new events.
-- Safe to reconcile an already prepared table; incompatible schema/duplicate rows fail visibly.
create table if not exists public.admin_notifications (
 id uuid primary key default gen_random_uuid(),
 admin_user_id uuid not null references public.profiles(id) on delete cascade,
 event_id uuid references public.admin_push_events(id) on delete set null,
 kind text not null check(kind in ('customer_registered','appointment_confirmed','appointment_completed')),
 entity_id uuid, starts_at timestamptz, booking_source text,
 created_at timestamptz not null default now(), read_at timestamptz
);
alter table public.admin_notifications enable row level security;
revoke all on public.admin_notifications from public,anon,authenticated;
grant all on public.admin_notifications to service_role;
create unique index if not exists admin_notifications_admin_event on public.admin_notifications(admin_user_id,event_id) where event_id is not null;
create index if not exists admin_notifications_page on public.admin_notifications(admin_user_id,created_at desc,id desc);
create index if not exists admin_notifications_unread on public.admin_notifications(admin_user_id,created_at desc,id desc) where read_at is null;
-- Ensure event cleanup preserves the inbox, including installations prepared manually.
do $$
declare constraint_name text;
begin
 for constraint_name in select c.conname from pg_constraint c
 where c.conrelid='public.admin_notifications'::regclass and c.contype='f'
 and c.confrelid='public.admin_push_events'::regclass
 and c.conkey=array[(select attnum from pg_attribute where attrelid='public.admin_notifications'::regclass and attname='event_id')]::smallint[]
 loop
   execute format('alter table public.admin_notifications drop constraint %I',constraint_name);
 end loop;
 alter table public.admin_notifications add constraint admin_notifications_event_retained
 foreign key(event_id) references public.admin_push_events(id) on delete set null;
end $$;
create or replace function public.admin_notification_event_created()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.kind not in ('customer_registered','appointment_confirmed','appointment_completed') then return new; end if;
 -- Inbox includes admin-created bookings and completed activity, independent of push preferences.
 insert into public.admin_notifications(admin_user_id,event_id,kind,entity_id,starts_at,booking_source,created_at)
 select p.id,new.id,new.kind,new.entity_id,new.starts_at,new.booking_source,new.created_at
 from public.profiles p where p.role='admin'
 on conflict(admin_user_id,event_id) where event_id is not null do nothing;
 return new;
exception when others then
 raise warning 'Admin inbox creation unavailable (SQLSTATE %)',sqlstate;
 return new;
end $$;
revoke all on function public.admin_notification_event_created() from public,anon,authenticated;
-- Replace the prepared trigger by name; do not install a second event listener.
drop trigger if exists admin_notification_event_created on public.admin_push_events;
create trigger admin_notification_event_created after insert on public.admin_push_events
for each row execute function public.admin_notification_event_created();

commit;
