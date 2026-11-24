-- 1200 Hairstudio: external Supabase dependencies
-- Review-only. Do not execute without the migration-plan README prerequisites.

begin;

-- Required by UUID generation in historical migrations and by the overlap constraint.
create extension if not exists pgcrypto with schema extensions;
create extension if not exists btree_gist with schema extensions;

-- PRECHECK (run separately before applying):
-- select u.id, u.email
-- from auth.users u
-- left join public.profiles p on p.id = u.id
-- where p.id is null;
--
-- select u.id, u.email
-- from auth.users u
-- left join public.customers c on c.profile_id = u.id
-- where c.id is null;

-- The public baseline contains public.handle_new_user(), but a public-only dump cannot contain
-- its auth.users trigger. Refuse to overwrite an unexpected trigger implementation.
do $$
declare
  existing_function regprocedure;
begin
  select t.tgfoid::regprocedure
  into existing_function
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'auth'
    and c.relname = 'users'
    and t.tgname = 'on_auth_user_created'
    and not t.tgisinternal;

  if existing_function is null then
    execute 'create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user()';
  elsif existing_function <> 'public.handle_new_user()'::regprocedure then
    raise exception 'auth.users trigger on_auth_user_created invokes %, expected public.handle_new_user()', existing_function;
  end if;
end
$$;

-- Buckets are application dependencies. Public read access is intentional because their URLs are
-- stored in public homepage records.
insert into storage.buckets (id, name, public)
values
  ('service-images', 'service-images', true),
  ('selected-work-images', 'selected-work-images', true)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public;

-- The legacy history already defines service-images policies. The selected-work bucket was not
-- represented in migrations, so add policies without replacing unknown production policies.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Public can view selected work images'
  ) then
    create policy "Public can view selected work images"
      on storage.objects for select to public
      using (bucket_id = 'selected-work-images');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Admins can upload selected work images'
  ) then
    create policy "Admins can upload selected work images"
      on storage.objects for insert to authenticated
      with check (
        bucket_id = 'selected-work-images'
        and exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.role = 'admin'
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Admins can update selected work images'
  ) then
    create policy "Admins can update selected work images"
      on storage.objects for update to authenticated
      using (
        bucket_id = 'selected-work-images'
        and exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.role = 'admin'
        )
      )
      with check (
        bucket_id = 'selected-work-images'
        and exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.role = 'admin'
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Admins can delete selected work images'
  ) then
    create policy "Admins can delete selected work images"
      on storage.objects for delete to authenticated
      using (
        bucket_id = 'selected-work-images'
        and exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.role = 'admin'
        )
      );
  end if;
end
$$;

commit;

-- POST-MIGRATION VERIFICATION:
-- select extname, extnamespace::regnamespace from pg_extension
-- where extname in ('pgcrypto', 'btree_gist');
--
-- select t.tgname, t.tgfoid::regprocedure
-- from pg_trigger t
-- join pg_class c on c.oid = t.tgrelid
-- join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'auth' and c.relname = 'users' and not t.tgisinternal;
--
-- select id, name, public from storage.buckets
-- where id in ('service-images', 'selected-work-images');
--
-- select policyname, roles, cmd, qual, with_check
-- from pg_policies
-- where schemaname = 'storage' and tablename = 'objects'
--   and (qual like '%service-images%' or qual like '%selected-work-images%'
--        or with_check like '%service-images%' or with_check like '%selected-work-images%')
-- order by policyname;

-- FORWARD-FIX GUIDANCE:
-- Do not drop managed auth/storage schemas. If trigger verification fails, inspect and reconcile the
-- existing trigger manually. Duplicate Storage policies should be consolidated in a follow-up
-- migration only after their effective permissions are compared.

