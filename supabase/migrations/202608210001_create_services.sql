create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  price numeric(10,2) not null check (price >= 0),
  duration_min integer not null check (duration_min > 0),
  duration_max integer check (
    duration_max is null
    or duration_max >= duration_min
  ),
  image_url text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

drop trigger if exists services_set_updated_at on public.services;
create trigger services_set_updated_at
before update on public.services
for each row
execute function public.set_updated_at();

alter table public.services enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'services'
      and policyname = 'Authenticated users can read services'
  ) then
    create policy "Authenticated users can read services"
      on public.services
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'services'
      and policyname = 'Authenticated users can insert services'
  ) then
    create policy "Authenticated users can insert services"
      on public.services
      for insert
      to authenticated
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'services'
      and policyname = 'Authenticated users can update services'
  ) then
    create policy "Authenticated users can update services"
      on public.services
      for update
      to authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'services'
      and policyname = 'Authenticated users can delete services'
  ) then
    create policy "Authenticated users can delete services"
      on public.services
      for delete
      to authenticated
      using (true);
  end if;
end
$$;

insert into public.services (
  name,
  description,
  price,
  duration_min,
  duration_max,
  image_url,
  is_active,
  sort_order
)
values
  ('Hair', 'Clean cut, styling & finish', 25, 30, 60, null, true, 0),
  ('Kid', 'Clean cut for younger clients', 20, 30, 30, null, true, 1),
  ('Hair + Beard', 'Complete haircut & beard finish', 35, 45, 60, null, true, 2)
on conflict (name) do update
set
  description = excluded.description,
  price = excluded.price,
  duration_min = excluded.duration_min,
  duration_max = excluded.duration_max,
  image_url = excluded.image_url,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  updated_at = timezone('utc'::text, now());
