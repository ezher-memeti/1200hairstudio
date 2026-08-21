insert into storage.buckets (id, name, public)
values ('service-images', 'service-images', true)
on conflict (id) do update
set public = true;

drop policy if exists "Authenticated users can read services" on public.services;
drop policy if exists "Authenticated users can insert services" on public.services;
drop policy if exists "Authenticated users can update services" on public.services;
drop policy if exists "Authenticated users can delete services" on public.services;

create policy "Public users can read active services"
  on public.services
  for select
  to anon, authenticated
  using (is_active = true);

create policy "Admins can read all services"
  on public.services
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

create policy "Admins can insert services"
  on public.services
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

create policy "Admins can update services"
  on public.services
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

create policy "Admins can delete services"
  on public.services
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

drop policy if exists "Public can view service images" on storage.objects;
drop policy if exists "Admins can upload service images" on storage.objects;
drop policy if exists "Admins can update service images" on storage.objects;
drop policy if exists "Admins can delete service images" on storage.objects;

create policy "Public can view service images"
  on storage.objects
  for select
  to public
  using (bucket_id = 'service-images');

create policy "Admins can upload service images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'service-images'
    and exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

create policy "Admins can update service images"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'service-images'
    and exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  )
  with check (
    bucket_id = 'service-images'
    and exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

create policy "Admins can delete service images"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'service-images'
    and exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );
