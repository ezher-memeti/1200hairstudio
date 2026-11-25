-- Dedicated push queue: existing EMAIL/WHATSAPP outbox constraints are unchanged.
create table public.admin_push_subscriptions (
 id uuid primary key default gen_random_uuid(),
 admin_user_id uuid not null references public.profiles(id) on delete cascade,
 endpoint text not null unique check (octet_length(endpoint) <= 2000),
 p256dh text not null, auth_key text not null, vapid_public_key text not null,
 locale text not null default 'de' check (locale in ('de','en')),
 active boolean not null default true, expires_at timestamptz,
 test_last_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.admin_push_events (
 id uuid primary key default gen_random_uuid(), event_key text not null unique,
 kind text not null check(kind in ('customer_registered','appointment_confirmed','appointment_completed','test')),
 entity_id uuid, starts_at timestamptz, booking_source text,
 created_at timestamptz not null default now()
);
create table public.admin_push_deliveries (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references public.admin_push_events(id) on delete cascade,
 subscription_id uuid not null references public.admin_push_subscriptions(id) on delete cascade,
 status text not null default 'PENDING' check(status in ('PENDING','PROCESSING','RETRY','SENT','FAILED','EXPIRED','UNKNOWN','SKIPPED')),
 attempts integer not null default 0 check(attempts between 0 and 5),
 available_at timestamptz not null default now(), claimed_at timestamptz, claim_token uuid,
 error_code text, accepted_at timestamptz, created_at timestamptz not null default now(),
 unique(event_id,subscription_id)
);
create index admin_push_pending on public.admin_push_deliveries(status,available_at);
alter table public.admin_push_subscriptions enable row level security;
alter table public.admin_push_events enable row level security;
alter table public.admin_push_deliveries enable row level security;
-- No direct browser grants or policies: all access passes verified server authorization.
revoke all on public.admin_push_subscriptions,public.admin_push_events,public.admin_push_deliveries from anon,authenticated;
grant all on public.admin_push_subscriptions,public.admin_push_events,public.admin_push_deliveries to service_role;

create function public.admin_push_enabled(p_kind text,p_source text default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare v jsonb; k text; d boolean;
begin
 select settings_value->'push' into v from public.admin_settings where settings_key='notifications';
 if p_kind='test' then return true; end if;
 k := case p_kind when 'customer_registered' then 'newCustomers' when 'appointment_confirmed' then 'newAppointments' else 'completed' end;
 d := p_kind in ('customer_registered','appointment_confirmed');
 if v ? k then d := (v->k = 'true'::jsonb); end if;
 if p_kind='appointment_confirmed' and p_source='admin' then d := d and coalesce(v->'adminBookings' = 'true'::jsonb,false); end if;
 return coalesce(d,false);
end $$;

create function public.admin_push_enqueue(p_key text,p_kind text,p_entity uuid,p_start timestamptz default null,p_source text default null)
returns void language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 insert into public.admin_push_events(event_key,kind,entity_id,starts_at,booking_source)
 values(p_key,p_kind,p_entity,p_start,p_source) on conflict(event_key) do nothing returning id into v_id;
 if v_id is null or not public.admin_push_enabled(p_kind,p_source) then return; end if;
 insert into public.admin_push_deliveries(event_id,subscription_id)
 select v_id,s.id from public.admin_push_subscriptions s join public.profiles p on p.id=s.admin_user_id
 where s.active and p.role='admin' and (s.expires_at is null or s.expires_at>now())
 on conflict(event_id,subscription_id) do nothing;
end $$;

create function public.admin_push_registration_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
declare u uuid; confirmed boolean;
begin
 if tg_table_name='profiles' then
   if new.role <> 'customer' then return new; end if;
   u:=new.id; select email_confirmed_at is not null into confirmed from auth.users where id=u;
 else
   u:=new.id; confirmed:=new.email_confirmed_at is not null;
   if tg_op='UPDATE' and old.email_confirmed_at is not null then return new; end if;
 end if;
 if confirmed and exists(select 1 from public.profiles where id=u and role='customer') then
   perform public.admin_push_enqueue('customer_registered:'||u,'customer_registered',u);
 end if;
 return new;
exception when others then
 raise warning 'Admin push registration enqueue unavailable (SQLSTATE %)',sqlstate;
 return new;
end $$;
create trigger admin_push_profile_created after insert on public.profiles for each row execute function public.admin_push_registration_trigger();
create trigger zz_admin_push_auth_created after insert on auth.users for each row execute function public.admin_push_registration_trigger();
create trigger admin_push_email_confirmed after update of email_confirmed_at on auth.users for each row
 when(old.email_confirmed_at is null and new.email_confirmed_at is not null) execute function public.admin_push_registration_trigger();

create function public.admin_push_appointment_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='confirmed' and (tg_op='INSERT' or old.status is distinct from new.status) then
   perform public.admin_push_enqueue('appointment_confirmed:'||new.id,'appointment_confirmed',new.id,new.start_at,new.booking_source);
 elsif tg_op='UPDATE' and new.status='completed' and old.status is distinct from new.status then
   perform public.admin_push_enqueue('appointment_completed:'||new.id,'appointment_completed',new.id,new.start_at,new.booking_source);
 end if;
 return new;
exception when others then
 raise warning 'Admin push appointment enqueue unavailable (SQLSTATE %)',sqlstate;
 return new;
end $$;
create trigger admin_push_appointment_persisted after insert or update of status on public.appointments
 for each row execute function public.admin_push_appointment_trigger();

create function public.admin_push_subscribe(p_admin uuid,p_endpoint text,p_p256dh text,p_auth text,p_public_key text,p_locale text,p_expires timestamptz default null,p_replace uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if not exists(select 1 from public.profiles where id=p_admin and role='admin') then raise exception 'forbidden'; end if;
 insert into public.admin_push_subscriptions(admin_user_id,endpoint,p256dh,auth_key,vapid_public_key,locale,expires_at)
 values(p_admin,p_endpoint,p_p256dh,p_auth,p_public_key,p_locale,p_expires)
 on conflict(endpoint) do update set p256dh=excluded.p256dh,auth_key=excluded.auth_key,vapid_public_key=excluded.vapid_public_key,
 locale=excluded.locale,expires_at=excluded.expires_at,active=true,updated_at=now()
 where public.admin_push_subscriptions.admin_user_id=p_admin returning id into v_id;
 if v_id is null then raise exception 'subscription_owned_elsewhere'; end if;
 if p_replace is not null and p_replace<>v_id then
 update public.admin_push_subscriptions set active=false,updated_at=now() where id=p_replace and admin_user_id=p_admin;
 end if;
 return v_id;
end $$;

create function public.admin_push_test(p_admin uuid,p_subscription uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_event uuid; v_delivery uuid; v_count integer;
begin
 if not exists(select 1 from public.profiles where id=p_admin and role='admin') then raise exception 'forbidden'; end if;
 update public.admin_push_subscriptions set test_last_at=now()
 where id=p_subscription and admin_user_id=p_admin and active and (expires_at is null or expires_at>now())
 and (test_last_at is null or test_last_at < now()-interval '60 seconds');
 get diagnostics v_count=row_count;
 if v_count=0 then return null; end if;
 insert into public.admin_push_events(event_key,kind,entity_id) values('test:'||gen_random_uuid(),'test',p_admin) returning id into v_event;
 insert into public.admin_push_deliveries(event_id,subscription_id) values(v_event,p_subscription) returning id into v_delivery;
 return v_delivery;
end $$;

create function public.admin_push_claim(p_limit integer default 8,p_delivery uuid default null)
returns table(id uuid,claim_token uuid,attempts integer,event_id uuid,kind text,starts_at timestamptz,locale text,endpoint text,p256dh text,auth_key text,vapid_public_key text)
language plpgsql security definer set search_path='' as $$
begin
 update public.admin_push_subscriptions s set active=false,updated_at=now()
 where s.active and s.expires_at is not null and s.expires_at<=now();
 -- Expired leases are ambiguous, not retryable: a provider may already have accepted them.
 update public.admin_push_deliveries d set status='UNKNOWN',error_code='lease_expired',claim_token=null
 where d.status='PROCESSING' and d.claimed_at<now()-interval '2 minutes';
 update public.admin_push_deliveries d set status='SKIPPED',error_code='disabled'
 from public.admin_push_events e,public.admin_push_subscriptions s,public.profiles p
 where d.event_id=e.id and d.subscription_id=s.id and s.admin_user_id=p.id and d.status in ('PENDING','RETRY')
 and (not s.active or p.role<>'admin' or (s.expires_at is not null and s.expires_at<=now()) or
 not public.admin_push_enabled(e.kind,e.booking_source) or
 (e.kind='customer_registered' and not exists(select 1 from public.profiles c where c.id=e.entity_id and c.role='customer')));
 update public.admin_push_deliveries d set status='FAILED',error_code='expired_event'
 where d.status in ('PENDING','RETRY') and d.created_at<now()-interval '24 hours';
 return query with candidates as (
 select d.id from public.admin_push_deliveries d
 where d.status in ('PENDING','RETRY') and d.available_at<=now() and d.attempts<5
 and (p_delivery is null or d.id=p_delivery)
 order by d.available_at,d.id limit greatest(1,least(p_limit,8)) for update of d skip locked
 ), claimed as (
 update public.admin_push_deliveries d set status='PROCESSING',claimed_at=now(),claim_token=gen_random_uuid(),attempts=d.attempts+1
 from candidates c where d.id=c.id returning d.*
 ) select d.id,d.claim_token,d.attempts,e.id,e.kind,e.starts_at,s.locale,s.endpoint,s.p256dh,s.auth_key,s.vapid_public_key
 from claimed d join public.admin_push_events e on e.id=d.event_id join public.admin_push_subscriptions s on s.id=d.subscription_id;
 -- Bounded retention; no customer/appointment rows are deleted.
 delete from public.admin_push_subscriptions s where not s.active and s.updated_at<now()-interval '30 days';
 delete from public.admin_push_events e where e.created_at<now()-interval '30 days';
end $$;

create function public.admin_push_finish(p_id uuid,p_token uuid,p_status text,p_error text default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_subscription uuid; v_attempts integer;
begin
 if p_status not in ('SENT','RETRY','FAILED','EXPIRED','UNKNOWN') or
 (p_error is not null and p_error not in ('rate_limited','provider','authorization','expired','network_unknown','key_mismatch','invalid_subscription')) then raise exception 'invalid_result'; end if;
 select d.subscription_id,d.attempts into v_subscription,v_attempts from public.admin_push_deliveries d
 where d.id=p_id and d.claim_token=p_token and d.status='PROCESSING' for update;
 if not found then return false; end if;
 update public.admin_push_deliveries set status=case when p_status='RETRY' and v_attempts>=5 then 'FAILED' else p_status end,
 error_code=p_error,accepted_at=case when p_status='SENT' then now() else null end,claim_token=null,
 available_at=case when p_status='RETRY' then now()+make_interval(secs=>least(3600,30*power(2,v_attempts-1))::integer) else available_at end
 where id=p_id;
 if p_status='EXPIRED' then update public.admin_push_subscriptions set active=false,updated_at=now() where id=v_subscription; end if;
 return true;
end $$;

revoke all on function public.admin_push_enabled(text,text),public.admin_push_enqueue(text,text,uuid,timestamptz,text),
 public.admin_push_registration_trigger(),public.admin_push_appointment_trigger(),
 public.admin_push_subscribe(uuid,text,text,text,text,text,timestamptz,uuid),public.admin_push_test(uuid,uuid),
 public.admin_push_claim(integer,uuid),public.admin_push_finish(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.admin_push_subscribe(uuid,text,text,text,text,text,timestamptz,uuid),public.admin_push_test(uuid,uuid),
 public.admin_push_claim(integer,uuid),public.admin_push_finish(uuid,uuid,text,text) to service_role;
