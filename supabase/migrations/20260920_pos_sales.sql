create table if not exists public.register_sessions (
  id uuid primary key default gen_random_uuid(),
  opened_at timestamptz not null default timezone('utc', now()),
  opened_by uuid not null references auth.users(id),
  opening_cash numeric(10,2) not null check (opening_cash >= 0),
  status text not null default 'open' check (status in ('open','closed')),
  closed_at timestamptz,
  closed_by uuid references auth.users(id),
  expected_cash numeric(10,2), actual_cash numeric(10,2), difference numeric(10,2),
  opening_note text, closing_note text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
create unique index if not exists one_open_register_session_idx on public.register_sessions(status) where status='open';
create index if not exists register_sessions_opened_at_idx on public.register_sessions(opened_at desc);

create table if not exists public.register_movements (
  id uuid primary key default gen_random_uuid(),
  register_session_id uuid not null references public.register_sessions(id),
  type text not null check (type in ('deposit','withdrawal')),
  amount numeric(10,2) not null check (amount > 0),
  note text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default timezone('utc', now())
);
create index if not exists register_movements_session_idx on public.register_movements(register_session_id,created_at);
alter table public.register_sessions enable row level security;
alter table public.register_movements enable row level security;
drop policy if exists "Admins manage register sessions" on public.register_sessions;
create policy "Admins manage register sessions" on public.register_sessions for all to authenticated using (exists(select 1 from public.profiles where id=auth.uid() and role='admin')) with check (exists(select 1 from public.profiles where id=auth.uid() and role='admin'));
drop policy if exists "Admins manage register movements" on public.register_movements;
create policy "Admins manage register movements" on public.register_movements for all to authenticated using (exists(select 1 from public.profiles where id=auth.uid() and role='admin')) with check (exists(select 1 from public.profiles where id=auth.uid() and role='admin'));

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  sale_number bigint generated always as identity unique,
  appointment_id uuid not null unique references public.appointments(id),
  customer_id uuid references public.customers(id),
  subtotal numeric(10,2) not null check (subtotal >= 0),
  discount_amount numeric(10,2) not null default 0 check (discount_amount >= 0),
  discount_source text check (discount_source is null or discount_source in ('promotion','loyalty','manual')),
  discount_type text,
  discount_value numeric(10,2),
  discount_reason text,
  loyalty_reward_id uuid references public.loyalty_rewards(id),
  loyalty_discount numeric(10,2) not null default 0 check (loyalty_discount >= 0),
  tip_amount numeric(10,2) not null default 0 check (tip_amount >= 0),
  tax_amount numeric(10,2) not null default 0 check (tax_amount >= 0),
  total numeric(10,2) not null check (total >= 0),
  status text not null default 'completed' check (status in ('completed','partially_refunded','refunded')),
  completed_at timestamptz not null default timezone('utc', now()),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id),
  service_id uuid references public.services(id),
  description text not null,
  quantity integer not null default 1 check (quantity > 0),
  unit_price numeric(10,2) not null check (unit_price >= 0),
  subtotal numeric(10,2) not null check (subtotal >= 0),
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.payments add column if not exists sale_id uuid references public.sales(id);
alter table public.payments add column if not exists register_session_id uuid references public.register_sessions(id);
alter table public.payments add column if not exists refunded_payment_id uuid references public.payments(id);
alter table public.payments add column if not exists tip_amount numeric(10,2) not null default 0 check (tip_amount >= 0);
alter table public.payments add column if not exists cash_received numeric(10,2) check (cash_received is null or cash_received >= 0);
alter table public.payments add column if not exists change_given numeric(10,2) check (change_given is null or change_given >= 0);
alter table public.receipts add column if not exists tip_amount numeric(10,2) not null default 0;
alter table public.receipts add column if not exists tax_amount numeric(10,2) not null default 0;

create index if not exists sales_completed_at_idx on public.sales(completed_at desc);
create index if not exists sales_customer_id_idx on public.sales(customer_id);
create index if not exists sale_items_sale_id_idx on public.sale_items(sale_id);
create index if not exists payments_sale_id_idx on public.payments(sale_id);
create index if not exists payments_refunded_payment_id_idx on public.payments(refunded_payment_id);

alter table public.sales enable row level security;
alter table public.sale_items enable row level security;

drop policy if exists "Admins manage sales" on public.sales;
create policy "Admins manage sales" on public.sales for all to authenticated
using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
drop policy if exists "Admins manage sale items" on public.sale_items;
create policy "Admins manage sale items" on public.sale_items for all to authenticated
using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

create or replace function public.complete_pos_checkout(
  p_appointment_id uuid,
  p_subtotal numeric,
  p_discount_amount numeric,
  p_discount_source text,
  p_discount_type text,
  p_discount_value numeric,
  p_discount_reason text,
  p_loyalty_reward_id uuid,
  p_loyalty_discount numeric,
  p_tip_amount numeric,
  p_tax_amount numeric,
  p_total numeric,
  p_payments jsonb
) returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_appointment public.appointments%rowtype;
  v_service public.services%rowtype;
  v_sale_id uuid;
  v_payment jsonb;
  v_paid numeric := 0;
  v_open_register uuid;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then raise exception 'Unauthorized'; end if;
  select * into v_appointment from public.appointments where id = p_appointment_id for update;
  if not found then raise exception 'Appointment not found'; end if;
  if exists (select 1 from public.sales where appointment_id = p_appointment_id) then raise exception 'Appointment already checked out'; end if;
  select * into v_service from public.services where id = v_appointment.service_id;
  if not found then raise exception 'Service not found'; end if;
  if round(p_subtotal,2) <> round(v_service.price,2) or p_discount_amount < 0 or p_loyalty_discount < 0 or p_total < 0 or p_tip_amount < 0 or p_tax_amount < 0 or round(p_total,2) <> round(greatest(0,p_subtotal-p_discount_amount-p_loyalty_discount+p_tax_amount),2) then raise exception 'Invalid checkout totals'; end if;
  if exists(select 1 from jsonb_array_elements(p_payments) item where item->>'method' not in ('cash','twint','card','bank_transfer','other') or (item->>'amount')::numeric <= 0) then raise exception 'Invalid payment split'; end if;
  select coalesce(sum((value->>'amount')::numeric),0) into v_paid from jsonb_array_elements(p_payments);
  if round(v_paid,2) <> round(p_total + p_tip_amount,2) then raise exception 'Payment split does not match checkout total'; end if;
  select id into v_open_register from public.register_sessions where status='open' limit 1;
  if v_open_register is null and exists(select 1 from jsonb_array_elements(p_payments) item where item->>'method'='cash') then raise exception 'Open the cash register before accepting cash'; end if;
  insert into public.sales(appointment_id,customer_id,subtotal,discount_amount,discount_source,discount_type,discount_value,discount_reason,loyalty_reward_id,loyalty_discount,tip_amount,tax_amount,total,created_by)
  values(v_appointment.id,v_appointment.customer_id,p_subtotal,p_discount_amount,p_discount_source,p_discount_type,p_discount_value,p_discount_reason,p_loyalty_reward_id,p_loyalty_discount,p_tip_amount,p_tax_amount,p_total,auth.uid()) returning id into v_sale_id;
  insert into public.sale_items(sale_id,service_id,description,quantity,unit_price,subtotal) values(v_sale_id,v_service.id,v_service.name,1,p_subtotal,p_subtotal);
  for v_payment in select value from jsonb_array_elements(p_payments) loop
    insert into public.payments(appointment_id,sale_id,transaction_type,amount,currency,payment_method,status,paid_at,notes,created_by,register_session_id,tip_amount,cash_received,change_given)
    values(v_appointment.id,v_sale_id,'payment',(v_payment->>'amount')::numeric,'CHF',v_payment->>'method','completed',timezone('utc',now()),null,auth.uid(),case when v_payment->>'method'='cash' then v_open_register else null end,coalesce((v_payment->>'tipAmount')::numeric,0),nullif(v_payment->>'cashReceived','')::numeric,nullif(v_payment->>'changeGiven','')::numeric);
  end loop;
  if p_loyalty_reward_id is not null then
    update public.loyalty_rewards set status='redeemed',redeemed_at=timezone('utc',now()),redeemed_appointment_id=v_appointment.id
    where id=p_loyalty_reward_id and customer_id=v_appointment.customer_id and (status='available' or redeemed_appointment_id=v_appointment.id);
    if not found then raise exception 'Loyalty reward is no longer available'; end if;
  end if;
  update public.appointments set status='completed',original_price=p_subtotal,discount_amount=p_discount_amount+p_loyalty_discount,final_price=p_total,discount_source=p_discount_source,discount_label=p_discount_reason,discount_type=p_discount_type,discount_value=p_discount_value,updated_at=timezone('utc',now()) where id=v_appointment.id;
  return v_sale_id;
end $$;

create or replace function public.refund_pos_sale(p_sale_id uuid,p_amount numeric,p_method text,p_note text)
returns uuid language plpgsql security invoker set search_path=public as $$
declare v_sale public.sales%rowtype; v_paid numeric; v_refunded numeric; v_payment_id uuid; v_open_register uuid; v_refund_id uuid;
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and role='admin') then raise exception 'Unauthorized'; end if;
  select * into v_sale from public.sales where id=p_sale_id for update;
  if not found then raise exception 'Sale not found'; end if;
  select coalesce(sum(amount),0) into v_paid from public.payments where sale_id=v_sale.id and transaction_type='payment' and status='completed';
  select coalesce(sum(amount),0) into v_refunded from public.payments where sale_id=v_sale.id and transaction_type='refund' and status='completed';
  if p_method not in ('cash','twint','card','bank_transfer','other') then raise exception 'Invalid refund method'; end if;
  if p_amount<=0 or p_amount>v_paid-v_refunded then raise exception 'Refund exceeds refundable amount'; end if;
  select id into v_payment_id from public.payments where sale_id=v_sale.id and transaction_type='payment' and status='completed' order by paid_at limit 1;
  if p_method='cash' then select id into v_open_register from public.register_sessions where status='open' limit 1; if v_open_register is null then raise exception 'Open the cash register before issuing a cash refund'; end if; else v_open_register := null; end if;
  insert into public.payments(appointment_id,sale_id,refunded_payment_id,transaction_type,amount,currency,payment_method,status,paid_at,notes,created_by,register_session_id)
  values(v_sale.appointment_id,v_sale.id,v_payment_id,'refund',round(p_amount,2),'CHF',p_method,'completed',timezone('utc',now()),nullif(trim(p_note),''),auth.uid(),v_open_register) returning id into v_refund_id;
  update public.sales set status=case when round(v_refunded+p_amount,2)>=round(v_paid,2) then 'refunded' else 'partially_refunded' end,updated_at=timezone('utc',now()) where id=v_sale.id;
  return v_refund_id;
end $$;
