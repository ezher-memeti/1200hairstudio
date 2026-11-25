-- OPERATOR-APPLIED ONLY, after the migration and Vercel configuration.
-- Event-driven only: enable pg_net and Vault. No pg_cron installation required.
-- Store these two secrets through the Vault dashboard (never paste credentials here):
-- admin_push_url = https://1200hairstudio.ch/api/internal/admin-push
-- admin_push_job_secret = the same high-entropy ADMIN_PUSH_JOB_SECRET as Vercel.
create or replace function public.admin_push_wake()
returns void language plpgsql security definer set search_path='' as $$
declare target text; secret text;
begin
 select decrypted_secret into target from vault.decrypted_secrets where name='admin_push_url' limit 1;
 select decrypted_secret into secret from vault.decrypted_secrets where name='admin_push_job_secret' limit 1;
 -- Do not allow arbitrary destinations or send the job secret to a preview/untrusted origin.
 if target is distinct from 'https://1200hairstudio.ch/api/internal/admin-push' or secret is null or length(secret)<32 then return; end if;
 perform net.http_post(url:=target, headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||secret),body:='{}'::jsonb,timeout_milliseconds:=30000);
exception when others then
 raise warning 'Admin push wake unavailable (SQLSTATE %)',sqlstate;
end $$;
revoke all on function public.admin_push_wake() from public,anon,authenticated;
create or replace function public.admin_push_wake_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
begin perform public.admin_push_wake(); return new; end $$;
revoke all on function public.admin_push_wake_trigger() from public,anon,authenticated;
-- Deliveries exist at this point; pg_net starts HTTP only AFTER transaction commit.
-- Statement-level triggers avoid one HTTP request per subscribed device.
drop trigger if exists admin_push_delivery_wake on public.admin_push_deliveries;
create trigger admin_push_delivery_wake after insert on public.admin_push_deliveries
for each statement execute function public.admin_push_wake_trigger();
-- Upgrade cleanup only: remove our former recurring job if pg_cron is already installed.
-- Do not install pg_cron or disturb any unrelated scheduled jobs.
do $$
begin
 if to_regclass('cron.job') is not null then
   execute 'select cron.unschedule(jobid) from cron.job where jobname = $1'
   using '1200-admin-push';
 end if;
end $$;
-- No periodic wake-up or polling. Missed requests/retries may remain pending.
