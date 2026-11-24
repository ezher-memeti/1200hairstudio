-- Descriptions are no longer part of the Services or Selected Work models.
-- Guard both the table and column checks so this remains safe across environments.

alter table if exists public.services
  drop column if exists description;

alter table if exists public.selected_work
  drop column if exists description;
