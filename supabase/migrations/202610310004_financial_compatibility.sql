-- Phase 3A: canonical discount compatibility and atomic financial operations.
-- Apply after Phase 2 enforcement. This remains compatible with the pre-Phase-3 application.

begin;

do $$
begin
  if to_regprocedure('public.get_my_customer()') is null then
    raise exception 'Phase 2 migrations must be applied before Phase 3';
  end if;
end
$$;

alter table public.appointments
  add column if not exists loyalty_reward_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.appointments'::regclass
      and conname = 'appointments_loyalty_reward_id_fkey'
  ) then
    alter table public.appointments
      add constraint appointments_loyalty_reward_id_fkey
      foreign key (loyalty_reward_id) references public.loyalty_rewards(id) on delete set null;
  end if;
end
$$;

-- Free-service rewards carry no monetary configuration value.
alter table public.loyalty_rewards alter column reward_value drop not null;
alter table public.loyalty_settings alter column reward_value drop not null;

-- Canonical application values: promotion/manual/loyalty and percentage/fixed/free_service.
-- NOT VALID preserves historical rows; the trigger canonicalizes every new or changed discount.
alter table public.appointments drop constraint if exists appointments_discount_source_check;
alter table public.appointments add constraint appointments_discount_source_check
  check (discount_source is null or discount_source in ('promotion', 'manual', 'loyalty')) not valid;
alter table public.appointments drop constraint if exists appointments_discount_type_check;
alter table public.appointments add constraint appointments_discount_type_check
  check (discount_type is null or discount_type in ('percentage', 'fixed', 'free_service')) not valid;

do $$
begin
  if exists (
    select redeemed_appointment_id from public.loyalty_rewards
    where redeemed_appointment_id is not null
    group by redeemed_appointment_id having count(*) > 1
  ) then
    raise exception 'Multiple loyalty rewards reference one appointment; reconcile before Phase 3';
  end if;
end
$$;

create unique index if not exists appointments_loyalty_reward_id_unique
  on public.appointments(loyalty_reward_id) where loyalty_reward_id is not null;
create unique index if not exists loyalty_rewards_redeemed_appointment_unique
  on public.loyalty_rewards(redeemed_appointment_id) where redeemed_appointment_id is not null;

create or replace function public.apply_appointment_discount()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service public.services%rowtype;
  v_promotion public.promotions%rowtype;
  v_reward public.loyalty_rewards%rowtype;
  v_customer public.customers%rowtype;
  v_discount numeric(10,2);
  v_usage integer;
begin
  select * into v_service from public.services where id = new.service_id;
  if not found then raise exception 'Service not found'; end if;
  new.original_price := round(coalesce(new.original_price, v_service.price), 2);
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.service_id is distinct from old.service_id) then
    new.original_price := round(v_service.price, 2);
  end if;

  if new.promotion_id is not null and new.loyalty_reward_id is not null then
    raise exception 'Promotion and loyalty reward cannot be combined';
  end if;

  if new.promotion_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(new.promotion_id::text || ':' || coalesce(new.customer_id::text, 'guest'), 1200));
    select * into v_promotion from public.promotions where id = new.promotion_id for update;
    if not found or not v_promotion.is_active
       or (v_promotion.starts_at is not null and v_promotion.starts_at > now())
       or (v_promotion.expires_at is not null and v_promotion.expires_at <= now())
       or (v_promotion.service_id is not null and v_promotion.service_id <> new.service_id) then
      raise exception 'Promotion is not available';
    end if;
    if v_promotion.audience_type <> 'all_customers' then
      if new.customer_id is null then raise exception 'Promotion requires a customer'; end if;
      select * into v_customer from public.customers where id = new.customer_id;
      if not found then raise exception 'Promotion customer not found'; end if;
      if v_promotion.audience_type = 'registered_customers' and not v_customer.is_registered then
        raise exception 'Promotion requires a registered customer';
      end if;
      if v_promotion.audience_type = 'selected_customers' and not exists (
        select 1 from public.promotion_customers pc
        where pc.promotion_id = v_promotion.id and pc.customer_id = new.customer_id
      ) then raise exception 'Promotion is not assigned to this customer'; end if;
    end if;
    select count(*) into v_usage from public.appointments a
    where a.promotion_id = v_promotion.id and a.customer_id = new.customer_id
      and a.status <> 'cancelled' and a.id <> new.id;
    if v_promotion.max_uses_per_customer is not null and v_usage >= v_promotion.max_uses_per_customer then
      raise exception 'Promotion usage limit reached';
    end if;
    if v_promotion.discount_value <= 0
       or (v_promotion.discount_type = 'percentage' and v_promotion.discount_value > 100) then
      raise exception 'Promotion has an invalid discount value';
    end if;
    v_discount := case v_promotion.discount_type
      when 'percentage' then round(new.original_price * least(100, greatest(0, v_promotion.discount_value)) / 100, 2)
      else least(new.original_price, greatest(0, v_promotion.discount_value)) end;
    new.discount_source := 'promotion';
    new.discount_type := v_promotion.discount_type;
    new.discount_value := v_promotion.discount_value;
    new.discount_label := v_promotion.name;
    new.discount_amount := least(new.original_price, v_discount);
    new.final_price := greatest(0, new.original_price - new.discount_amount);
  elsif new.loyalty_reward_id is not null then
    select * into v_reward from public.loyalty_rewards where id = new.loyalty_reward_id for update;
    if not found or new.customer_id is null or v_reward.customer_id <> new.customer_id
       or (v_reward.expires_at is not null and v_reward.expires_at <= now())
       or not (v_reward.status in ('available', 'reserved') or (v_reward.status = 'redeemed' and v_reward.redeemed_appointment_id = new.id)) then
      raise exception 'Loyalty reward is not available for this customer';
    end if;
    if (v_reward.reward_type = 'free_service' and v_reward.reward_value is not null)
       or (v_reward.reward_type = 'fixed_discount' and coalesce(v_reward.reward_value, 0) <= 0)
       or (v_reward.reward_type = 'percentage' and (coalesce(v_reward.reward_value, 0) <= 0 or v_reward.reward_value > 100)) then
      raise exception 'Loyalty reward has an invalid value';
    end if;
    v_discount := case v_reward.reward_type
      when 'free_service' then new.original_price
      when 'percentage' then round(new.original_price * least(100, greatest(0, coalesce(v_reward.reward_value, 0))) / 100, 2)
      else least(new.original_price, greatest(0, coalesce(v_reward.reward_value, 0))) end;
    new.promotion_id := null;
    new.discount_source := 'loyalty';
    new.discount_type := case when v_reward.reward_type = 'fixed_discount' then 'fixed' else v_reward.reward_type end;
    new.discount_value := case when v_reward.reward_type = 'free_service' then null else v_reward.reward_value end;
    new.discount_label := 'Loyalty Reward';
    new.discount_amount := least(new.original_price, v_discount);
    new.final_price := greatest(0, new.original_price - new.discount_amount);
  elsif new.discount_source in ('manual', 'custom') then
    new.discount_source := 'manual';
    if new.discount_type not in ('percentage', 'fixed') or coalesce(new.discount_value, 0) <= 0 then
      raise exception 'Invalid manual discount';
    end if;
    if new.discount_type = 'percentage' and new.discount_value > 100 then
      raise exception 'Invalid manual percentage';
    end if;
    if nullif(trim(new.discount_label), '') is null then
      raise exception 'Manual discount reason is required';
    end if;
    v_discount := case new.discount_type
      when 'percentage' then round(new.original_price * new.discount_value / 100, 2)
      else least(new.original_price, new.discount_value) end;
    new.promotion_id := null;
    new.loyalty_reward_id := null;
    new.discount_amount := least(new.original_price, v_discount);
    new.final_price := greatest(0, new.original_price - new.discount_amount);
  elsif new.discount_source = 'loyalty' then
    -- Temporary compatibility for the old reserve/insert/redeem application flow.
    if coalesce(new.discount_amount, 0) < 0 or coalesce(new.discount_amount, 0) > new.original_price then
      raise exception 'Invalid legacy loyalty discount';
    end if;
    if new.discount_type = 'fixed_discount' then new.discount_type := 'fixed'; end if;
    new.final_price := greatest(0, new.original_price - coalesce(new.discount_amount, 0));
  else
    new.promotion_id := null;
    new.loyalty_reward_id := null;
    new.discount_source := null;
    new.discount_type := null;
    new.discount_value := null;
    new.discount_label := null;
    new.discount_amount := 0;
    new.final_price := new.original_price;
  end if;
  return new;
end
$$;

create or replace function public.redeem_appointment_loyalty_reward()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.loyalty_reward_id is null then return new; end if;
  update public.loyalty_rewards
  set status = 'redeemed', redeemed_at = coalesce(redeemed_at, now()),
      redeemed_appointment_id = new.id, updated_at = now()
  where id = new.loyalty_reward_id and customer_id = new.customer_id
    and (status in ('available', 'reserved') or (status = 'redeemed' and redeemed_appointment_id = new.id));
  if not found then raise exception 'Loyalty reward could not be redeemed'; end if;
  return new;
end
$$;

drop trigger if exists appointments_apply_discount on public.appointments;
create trigger appointments_apply_discount
before insert or update of service_id, customer_id, original_price, discount_source,
  discount_type, discount_value, promotion_id, loyalty_reward_id
on public.appointments for each row execute function public.apply_appointment_discount();

drop trigger if exists appointments_redeem_loyalty_reward on public.appointments;
create trigger appointments_redeem_loyalty_reward
after insert or update of loyalty_reward_id
on public.appointments for each row execute function public.redeem_appointment_loyalty_reward();

revoke all on function public.apply_appointment_discount() from public, anon, authenticated;
revoke all on function public.redeem_appointment_loyalty_reward() from public, anon, authenticated;

create or replace function public.complete_pos_checkout(
  p_appointment_id uuid, p_subtotal numeric, p_discount_amount numeric,
  p_discount_source text, p_discount_type text, p_discount_value numeric,
  p_discount_reason text, p_promotion_id uuid, p_loyalty_reward_id uuid,
  p_loyalty_discount numeric, p_tip_amount numeric, p_tax_amount numeric,
  p_total numeric, p_payments jsonb
) returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_appointment public.appointments%rowtype;
  v_sale_id uuid;
  v_payment jsonb;
  v_paid numeric := 0;
  v_payment_tips numeric := 0;
  v_open_register uuid;
  v_non_loyalty_discount numeric := 0;
  v_loyalty_discount numeric := 0;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then raise exception 'Unauthorized'; end if;
  select * into v_appointment from public.appointments where id = p_appointment_id for update;
  if not found then raise exception 'Appointment not found'; end if;
  if v_appointment.status <> 'confirmed' then raise exception 'Only confirmed appointments can be checked out'; end if;
  if exists (select 1 from public.sales where appointment_id = p_appointment_id) then raise exception 'Appointment already checked out'; end if;
  if p_subtotal is null or p_subtotal < 0 or round(p_subtotal, 2) <> round(coalesce(v_appointment.original_price, 0), 2) then raise exception 'Checkout subtotal does not match booking snapshot'; end if;
  if p_discount_source is null then
    update public.appointments set promotion_id=null, loyalty_reward_id=null, discount_source=null,
      discount_type=null, discount_value=null, discount_label=null
    where id=p_appointment_id returning * into v_appointment;
  elsif p_discount_source = 'promotion' then
    if p_promotion_id is null then raise exception 'Promotion is required'; end if;
    update public.appointments set promotion_id=p_promotion_id, loyalty_reward_id=null,
      discount_source='promotion' where id=p_appointment_id returning * into v_appointment;
  elsif p_discount_source = 'loyalty' then
    if p_loyalty_reward_id is null then raise exception 'Loyalty reward is required'; end if;
    update public.appointments set promotion_id=null, loyalty_reward_id=p_loyalty_reward_id,
      discount_source='loyalty' where id=p_appointment_id returning * into v_appointment;
  elsif p_discount_source = 'manual' then
    update public.appointments set promotion_id=null, loyalty_reward_id=null,
      discount_source='manual', discount_type=p_discount_type, discount_value=p_discount_value,
      discount_label=nullif(trim(p_discount_reason),'')
    where id=p_appointment_id returning * into v_appointment;
  else raise exception 'Unsupported discount source';
  end if;

  if v_appointment.discount_source = 'loyalty' then v_loyalty_discount := coalesce(v_appointment.discount_amount,0);
  else v_non_loyalty_discount := coalesce(v_appointment.discount_amount,0); end if;
  if round(coalesce(p_discount_amount,0),2) <> round(v_non_loyalty_discount,2)
     or round(coalesce(p_loyalty_discount,0),2) <> round(v_loyalty_discount,2) then
    raise exception 'Checkout discount does not match validated discount';
  end if;
  if p_total is null or p_tip_amount is null or p_tax_amount is null
     or p_tip_amount < 0 or p_tax_amount < 0
     or round(p_total,2) <> round(greatest(0,v_appointment.final_price + p_tax_amount),2) then
    raise exception 'Invalid checkout totals';
  end if;
  if p_payments is null or jsonb_typeof(p_payments) <> 'array' then raise exception 'Payments must be an array'; end if;
  if exists (select 1 from jsonb_array_elements(p_payments) item
    where item->>'method' is null or item->>'method' not in ('cash','twint','card','bank_transfer','other')
      or item->>'amount' is null or (item->>'amount')::numeric <= 0 or coalesce((item->>'tipAmount')::numeric,0) < 0
      or coalesce((item->>'tipAmount')::numeric,0) > (item->>'amount')::numeric) then
    raise exception 'Invalid payment split';
  end if;
  select coalesce(sum((value->>'amount')::numeric),0), coalesce(sum(coalesce((value->>'tipAmount')::numeric,0)),0)
  into v_paid, v_payment_tips from jsonb_array_elements(p_payments);
  if round(v_paid,2) <> round(p_total + p_tip_amount,2) or round(v_payment_tips,2) <> round(p_tip_amount,2) then
    raise exception 'Payment split does not match checkout total and tip';
  end if;
  if v_paid = 0 and p_total + p_tip_amount > 0 then raise exception 'Payment is required'; end if;
  if exists (select 1 from jsonb_array_elements(p_payments) item where item->>'method'='cash') then
    select id into v_open_register from public.register_sessions where status='open' limit 1 for update;
    if v_open_register is null then raise exception 'Open the cash register before accepting cash'; end if;
  end if;
  if exists (select 1 from jsonb_array_elements(p_payments) item where item->>'method'='cash'
    and (coalesce(nullif(item->>'cashReceived','')::numeric,(item->>'amount')::numeric) < (item->>'amount')::numeric
      or round(coalesce(nullif(item->>'changeGiven','')::numeric,0),2) <>
         round(coalesce(nullif(item->>'cashReceived','')::numeric,(item->>'amount')::numeric) - (item->>'amount')::numeric,2))) then
    raise exception 'Invalid cash received or change';
  end if;

  insert into public.sales(appointment_id,customer_id,subtotal,discount_amount,discount_source,
    discount_type,discount_value,discount_reason,loyalty_reward_id,loyalty_discount,tip_amount,
    tax_amount,total,created_by)
  values(v_appointment.id,v_appointment.customer_id,p_subtotal,v_non_loyalty_discount,
    v_appointment.discount_source,v_appointment.discount_type,v_appointment.discount_value,
    v_appointment.discount_label,v_appointment.loyalty_reward_id,v_loyalty_discount,p_tip_amount,
    p_tax_amount,p_total,auth.uid()) returning id into v_sale_id;
  insert into public.sale_items(sale_id,service_id,description,quantity,unit_price,subtotal)
  select v_sale_id,s.id,s.name,1,p_subtotal,p_subtotal from public.services s where s.id=v_appointment.service_id;
  for v_payment in select value from jsonb_array_elements(p_payments) loop
    insert into public.payments(appointment_id,sale_id,transaction_type,amount,currency,payment_method,
      status,paid_at,notes,created_by,register_session_id,tip_amount,cash_received,change_given)
    values(v_appointment.id,v_sale_id,'payment',(v_payment->>'amount')::numeric,'CHF',v_payment->>'method',
      'completed',timezone('utc',now()),null,auth.uid(),case when v_payment->>'method'='cash' then v_open_register else null end,
      coalesce((v_payment->>'tipAmount')::numeric,0),nullif(v_payment->>'cashReceived','')::numeric,
      nullif(v_payment->>'changeGiven','')::numeric);
  end loop;
  update public.appointments set status='completed', final_price=p_total, updated_at=timezone('utc',now()) where id=v_appointment.id;
  return v_sale_id;
end
$$;

revoke all on function public.complete_pos_checkout(uuid,numeric,numeric,text,text,numeric,text,uuid,uuid,numeric,numeric,numeric,numeric,jsonb) from public, anon;
grant execute on function public.complete_pos_checkout(uuid,numeric,numeric,text,text,numeric,text,uuid,uuid,numeric,numeric,numeric,numeric,jsonb) to authenticated, service_role;

create or replace function public.refund_pos_sale(p_sale_id uuid,p_amount numeric,p_method text,p_note text)
returns uuid language plpgsql set search_path=public as $$
declare
  v_sale public.sales%rowtype; v_paid numeric; v_refunded numeric;
  v_principal_paid numeric; v_principal_refunded numeric; v_refund_tip numeric;
  v_refund_principal numeric; v_payment_id uuid; v_open_register uuid; v_refund_id uuid;
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and role='admin') then raise exception 'Unauthorized'; end if;
  select * into v_sale from public.sales where id=p_sale_id for update;
  if not found then raise exception 'Sale not found'; end if;
  select coalesce(sum(amount),0), coalesce(sum(amount-tip_amount),0) into v_paid,v_principal_paid
    from public.payments where sale_id=v_sale.id and transaction_type='payment' and status='completed';
  select coalesce(sum(amount),0), coalesce(sum(amount-tip_amount),0) into v_refunded,v_principal_refunded
    from public.payments where sale_id=v_sale.id and transaction_type='refund' and status='completed';
  if p_method not in ('cash','twint','card','bank_transfer','other') then raise exception 'Invalid refund method'; end if;
  if p_amount is null or p_amount<=0 or round(p_amount,2)>round(v_paid-v_refunded,2) then raise exception 'Refund exceeds refundable amount'; end if;
  v_refund_principal := least(round(p_amount,2), greatest(0,v_principal_paid-v_principal_refunded));
  v_refund_tip := round(p_amount,2)-v_refund_principal;
  select id into v_payment_id from public.payments where sale_id=v_sale.id and transaction_type='payment' and status='completed' order by paid_at limit 1;
  if p_method='cash' then
    select id into v_open_register from public.register_sessions where status='open' limit 1 for update;
    if v_open_register is null then raise exception 'Open the cash register before issuing a cash refund'; end if;
  end if;
  insert into public.payments(appointment_id,sale_id,refunded_payment_id,transaction_type,amount,
    currency,payment_method,status,paid_at,notes,created_by,register_session_id,tip_amount)
  values(v_sale.appointment_id,v_sale.id,v_payment_id,'refund',round(p_amount,2),'CHF',p_method,
    'completed',timezone('utc',now()),nullif(trim(p_note),''),auth.uid(),v_open_register,v_refund_tip)
  returning id into v_refund_id;
  update public.sales set status=case when round(v_refunded+p_amount,2)>=round(v_paid,2)
    then 'refunded' else 'partially_refunded' end,updated_at=timezone('utc',now()) where id=v_sale.id;
  return v_refund_id;
end $$;

-- Historical refunds are deliberately not rewritten. Existing zero tip_amount values remain
-- unchanged unless they are separately reviewed and corrected through an audited process.

create or replace view public.appointment_finance_summary with (security_invoker=true) as
select a.id appointment_id,a.booking_reference,a.customer_id,a.service_id,a.start_at,a.end_at,
  a.status appointment_status,coalesce(a.original_price,0)::numeric(10,2) original_price,
  coalesce(a.discount_amount,0)::numeric(10,2) discount_amount,
  coalesce(a.final_price,a.original_price,0)::numeric(10,2) amount_due,
  coalesce(sum(p.amount-p.tip_amount) filter(where p.transaction_type='payment' and p.status='completed'),0)::numeric(10,2) total_paid,
  coalesce(sum(p.amount-p.tip_amount) filter(where p.transaction_type='refund' and p.status='completed'),0)::numeric(10,2) total_refunded,
  (coalesce(sum(p.amount-p.tip_amount) filter(where p.transaction_type='payment' and p.status='completed'),0)-
   coalesce(sum(p.amount-p.tip_amount) filter(where p.transaction_type='refund' and p.status='completed'),0))::numeric(10,2) net_paid,
  case when coalesce(a.final_price,a.original_price,0)=0 then 'not_required'
    when coalesce(sum(p.amount-p.tip_amount) filter(where p.transaction_type='payment' and p.status='completed'),0)-coalesce(sum(p.amount-p.tip_amount) filter(where p.transaction_type='refund' and p.status='completed'),0)<=0 then 'unpaid'
    when coalesce(sum(p.amount-p.tip_amount) filter(where p.transaction_type='payment' and p.status='completed'),0)-coalesce(sum(p.amount-p.tip_amount) filter(where p.transaction_type='refund' and p.status='completed'),0)<coalesce(a.final_price,a.original_price,0) then 'partially_paid'
    when coalesce(sum(p.amount-p.tip_amount) filter(where p.transaction_type='payment' and p.status='completed'),0)-coalesce(sum(p.amount-p.tip_amount) filter(where p.transaction_type='refund' and p.status='completed'),0)=coalesce(a.final_price,a.original_price,0) then 'paid'
    else 'overpaid' end payment_status
from public.appointments a left join public.payments p on p.appointment_id=a.id
group by a.id,a.booking_reference,a.customer_id,a.service_id,a.start_at,a.end_at,a.status,
  a.original_price,a.discount_amount,a.final_price;

commit;

-- HISTORICAL REVIEW (read-only; no automatic normalization):
-- select id, discount_source, discount_type from public.appointments
-- where discount_source = 'custom' or discount_type = 'fixed_discount';
-- select id, sale_id, amount, tip_amount from public.payments
-- where transaction_type = 'refund' and status = 'completed' and tip_amount = 0;
