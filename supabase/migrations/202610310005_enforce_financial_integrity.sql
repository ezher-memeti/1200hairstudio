-- Phase 3B enforcement. Apply after the Phase-3-compatible application is deployed and tested.

begin;

do $$
begin
  if to_regprocedure('public.complete_pos_checkout(uuid,numeric,numeric,text,text,numeric,text,uuid,uuid,numeric,numeric,numeric,numeric,jsonb)') is null then
    raise exception 'Phase 3A migration must be applied before Phase 3B';
  end if;
end
$$;

-- The old checkout signature trusts caller-supplied discount semantics and is no longer used.
drop function if exists public.complete_pos_checkout(uuid,numeric,numeric,text,text,numeric,text,uuid,numeric,numeric,numeric,numeric,jsonb);

alter table public.sales drop constraint if exists sales_discount_source_check;
alter table public.sales add constraint sales_discount_source_check
  check (discount_source is null or discount_source in ('promotion','manual','loyalty')) not valid;
alter table public.sales add constraint sales_discount_type_check
  check (discount_type is null or discount_type in ('percentage','fixed','free_service')) not valid;
alter table public.sales add constraint sales_totals_consistent
  check (
    discount_amount <= subtotal and loyalty_discount <= subtotal
    and discount_amount + loyalty_discount <= subtotal
    and total = round(greatest(0,subtotal-discount_amount-loyalty_discount+tax_amount),2)
  ) not valid;
alter table public.sales add constraint sales_discount_semantics
  check (
    (discount_source is null and discount_amount=0 and loyalty_discount=0 and loyalty_reward_id is null)
    or (discount_source='promotion' and discount_amount>0 and loyalty_discount=0 and loyalty_reward_id is null)
    or (discount_source='manual' and discount_amount>0 and loyalty_discount=0 and loyalty_reward_id is null)
    or (discount_source='loyalty' and loyalty_discount>=0 and discount_amount=0 and loyalty_reward_id is not null)
  ) not valid;

alter table public.appointments add constraint appointments_prices_consistent
  check (original_price>=0 and discount_amount>=0 and discount_amount<=original_price
    and final_price>=round(original_price-discount_amount,2)) not valid;
alter table public.appointments add constraint appointments_discount_links_consistent
  check (
    (discount_source is null and promotion_id is null and loyalty_reward_id is null and discount_amount=0)
    or (discount_source='promotion' and promotion_id is not null and loyalty_reward_id is null)
    or (discount_source='manual' and promotion_id is null and loyalty_reward_id is null)
    or (discount_source='loyalty' and promotion_id is null and loyalty_reward_id is not null)
  ) not valid;

alter table public.loyalty_rewards add constraint loyalty_rewards_value_valid
  check ((reward_type='free_service' and reward_value is null)
    or (reward_type='fixed_discount' and reward_value>0)
    or (reward_type='percentage' and reward_value>0 and reward_value<=100)) not valid;
alter table public.loyalty_settings add constraint loyalty_settings_value_valid
  check ((reward_type='free_service' and reward_value is null)
    or (reward_type='fixed_discount' and reward_value>0)
    or (reward_type='percentage' and reward_value>0 and reward_value<=100)) not valid;
alter table public.promotions add constraint promotions_discount_value_valid
  check (discount_value>0 and (discount_type<>'percentage' or discount_value<=100)) not valid;

alter table public.payments add constraint payments_tip_not_greater_than_amount
  check (tip_amount>=0 and tip_amount<=amount) not valid;
alter table public.payments add constraint payments_cash_values_consistent
  check ((payment_method<>'cash' and cash_received is null and change_given is null)
    or (payment_method='cash' and ((cash_received is null and change_given is null)
      or (cash_received>=amount and change_given=round(cash_received-amount,2))))) not valid;

alter table public.receipts add constraint receipts_totals_consistent
  check (discount_amount<=subtotal and total=round(greatest(0,subtotal-discount_amount+tax_amount),2)
    and balance>=0 and amount_paid>=0) not valid;

revoke all on function public.apply_appointment_discount() from public, anon, authenticated;
revoke all on function public.redeem_appointment_loyalty_reward() from public, anon, authenticated;

commit;

-- Validate NOT VALID constraints only after the verification queries identify and reconcile legacy rows:
-- alter table public.sales validate constraint sales_totals_consistent;
-- alter table public.appointments validate constraint appointments_prices_consistent;
-- alter table public.loyalty_rewards validate constraint loyalty_rewards_value_valid;
-- alter table public.loyalty_settings validate constraint loyalty_settings_value_valid;
-- alter table public.promotions validate constraint promotions_discount_value_valid;
-- alter table public.payments validate constraint payments_tip_not_greater_than_amount;
-- alter table public.receipts validate constraint receipts_totals_consistent;
