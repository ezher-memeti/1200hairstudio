-- The register tables and payments.register_session_id already exist in the
-- deployed schema. Add only the POS payment fields that are absent there.
alter table public.payments
  add column if not exists tip_amount numeric(10,2) not null default 0
    check (tip_amount >= 0);

create index if not exists payments_register_session_id_idx
  on public.payments(register_session_id)
  where register_session_id is not null;

comment on column public.payments.tip_amount is
  'Tip portion of a completed POS payment; included in drawer cash but separated from service revenue.';

notify pgrst, 'reload schema';
