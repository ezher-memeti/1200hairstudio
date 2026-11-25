begin;
-- Shared Vercel-instance budgets. Keys contain only server-HMAC digests, never raw emails/IPs.
create table public.auth_form_limits (
 key text primary key check(octet_length(key)<=128),
 attempts integer not null check(attempts between 1 and 101),
 expires_at timestamptz not null
);
create index auth_form_limits_expiry on public.auth_form_limits(expires_at);
alter table public.auth_form_limits enable row level security;
revoke all on public.auth_form_limits from public,anon,authenticated;
grant all on public.auth_form_limits to service_role;
create function public.consume_auth_form_bucket(p_key text,p_limit integer)
returns integer language plpgsql security definer set search_path='' as $$
declare n integer; until_at timestamptz;
begin
 insert into public.auth_form_limits as b(key,attempts,expires_at)
 values(p_key,1,now()+interval '15 minutes')
 on conflict(key) do update set
 attempts=case when b.expires_at<=now() then 1 else least(b.attempts+1,p_limit+1) end,
 expires_at=case when b.expires_at<=now() then now()+interval '15 minutes' else b.expires_at end
 returning attempts,expires_at into n,until_at;
 return case when n>p_limit then greatest(1,ceil(extract(epoch from until_at-now()))::integer) else 0 end;
end $$;
create function public.consume_auth_form_budget(p_action text,p_client_hash text,p_email_hash text)
returns integer language plpgsql security definer set search_path='' as $$
declare wait_seconds integer;
begin
 if p_action is null or p_action not in ('register','forgot-password') or p_client_hash !~ '^[a-f0-9]{64}$' or p_email_hash !~ '^[a-f0-9]{64}$'
 or p_client_hash is null or p_email_hash is null then raise exception 'invalid_budget'; end if;
 -- Bounded opportunistic expiry cleanup, no scheduler.
 delete from public.auth_form_limits where key in (select key from public.auth_form_limits where expires_at<=now() order by expires_at limit 200);
 wait_seconds:=public.consume_auth_form_bucket(p_action||':global',100);
 if wait_seconds>0 then return wait_seconds; end if;
 wait_seconds:=public.consume_auth_form_bucket(p_action||':client:'||p_client_hash,10);
 if wait_seconds>0 then return wait_seconds; end if;
 return public.consume_auth_form_bucket(p_action||':email:'||p_email_hash,3);
end $$;
-- Private RPC, not a public account lookup: only the server service role may call it.
create function public.auth_form_account_exists(p_email text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users u where lower(u.email)=lower(btrim(p_email)) and u.deleted_at is null);
$$;
revoke all on function public.consume_auth_form_bucket(text,integer),public.consume_auth_form_budget(text,text,text),public.auth_form_account_exists(text) from public,anon,authenticated;
grant execute on function public.consume_auth_form_budget(text,text,text),public.auth_form_account_exists(text) to service_role;
commit;
