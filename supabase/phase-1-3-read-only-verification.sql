-- Phase 1-3 production release verification (READ ONLY)
-- Run with a database role that can inspect auth/storage metadata.
-- This file contains SELECT statements only. Save output securely: it includes record identifiers.

-- 1. Auth signup trigger and its target function.
select
  n.nspname as table_schema,
  c.relname as table_name,
  t.tgname as trigger_name,
  pg_get_triggerdef(t.oid, true) as trigger_definition,
  pn.nspname as function_schema,
  p.proname as function_name,
  p.prosecdef as security_definer,
  p.proconfig as function_settings,
  p.proacl as execute_acl
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc p on p.oid = t.tgfoid
join pg_namespace pn on pn.oid = p.pronamespace
where not t.tgisinternal
  and n.nspname = 'auth'
  and c.relname = 'users'
order by t.tgname;

-- 2. Required Storage buckets. Compare MIME and size limits with intended upload behavior.
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id in ('service-images', 'selected-work-images')
order by id;

-- 3. Storage object policies. Public reads should be bucket-limited; writes should require admin.
select policyname, roles, cmd, permissive, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by policyname;

-- 4. Public RLS status and policy definitions for Phase 1-3 affected tables.
select n.nspname as schema_name, c.relname as table_name,
       c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
  and c.relname in (
    'appointments', 'customers', 'loyalty_rewards', 'loyalty_visits',
    'recurring_bookings', 'services', 'sales', 'payments', 'receipts'
  )
order by c.relname;

select tablename, policyname, roles, cmd, permissive, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'appointments', 'customers', 'loyalty_rewards', 'loyalty_visits',
    'recurring_bookings', 'services', 'sales', 'payments', 'receipts'
  )
order by tablename, policyname;

-- 5. SECURITY DEFINER functions and effective EXECUTE grants.
select
  n.nspname as schema_name,
  p.proname,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  p.prosecdef as security_definer,
  p.proconfig as function_settings,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (p.prosecdef or p.proname in (
    'create_guest_appointment', 'complete_pos_checkout', 'refund_pos_sale',
    'get_my_customer', 'ensure_my_customer', 'update_my_customer_profile',
    'set_my_marketing_email_preference', 'get_my_available_promotions',
    'handle_new_user'
  ))
order by p.proname, identity_arguments;

-- 6. Preconditions that can stop migrations 001 or 004.
select lower(trim(email)) as normalized_email, count(*) as customer_count,
       array_agg(id order by created_at) as customer_ids
from public.customers
group by lower(trim(email))
having count(*) > 1;

select redeemed_appointment_id, count(*) as reward_count,
       array_agg(id order by earned_at) as reward_ids
from public.loyalty_rewards
where redeemed_appointment_id is not null
group by redeemed_appointment_id
having count(*) > 1;

-- 7. Historical appointment discount/link anomalies.
select id, booking_reference, customer_id, promotion_id, loyalty_reward_id,
       original_price, discount_amount, final_price,
       discount_source, discount_type, discount_value
from public.appointments
where discount_source not in ('promotion', 'manual', 'loyalty')
   or discount_type not in ('percentage', 'fixed', 'free_service')
   or coalesce(original_price, 0) < 0
   or coalesce(discount_amount, 0) < 0
   or coalesce(discount_amount, 0) > coalesce(original_price, 0)
   or coalesce(final_price, 0) < round(coalesce(original_price, 0) - coalesce(discount_amount, 0), 2)
   or (discount_source is null and (promotion_id is not null or loyalty_reward_id is not null or coalesce(discount_amount, 0) <> 0))
   or (discount_source = 'promotion' and (promotion_id is null or loyalty_reward_id is not null))
   or (discount_source = 'manual' and (promotion_id is not null or loyalty_reward_id is not null))
   or (discount_source = 'loyalty' and (promotion_id is not null or loyalty_reward_id is null))
order by start_at, id;

-- 8. Reward ownership, redemption linkage, duplicate use, and value anomalies.
select lr.id as reward_id, lr.customer_id as reward_customer_id, lr.status,
       lr.reward_type, lr.reward_value, lr.redeemed_appointment_id,
       a.customer_id as appointment_customer_id, a.loyalty_reward_id as appointment_reward_id
from public.loyalty_rewards lr
left join public.appointments a on a.id = lr.redeemed_appointment_id
where (lr.reward_type = 'free_service' and lr.reward_value is not null)
   or (lr.reward_type = 'fixed_discount' and coalesce(lr.reward_value, 0) <= 0)
   or (lr.reward_type = 'percentage' and (coalesce(lr.reward_value, 0) <= 0 or lr.reward_value > 100))
   or (lr.redeemed_appointment_id is not null and (
        a.id is null or a.customer_id is distinct from lr.customer_id
        or a.loyalty_reward_id is distinct from lr.id
      ))
   or (lr.status = 'redeemed' and lr.redeemed_appointment_id is null)
   or (lr.status <> 'redeemed' and lr.redeemed_appointment_id is not null)
order by lr.earned_at, lr.id;

select loyalty_reward_id, count(*) as appointment_count, array_agg(id order by start_at) as appointment_ids
from public.appointments
where loyalty_reward_id is not null
group by loyalty_reward_id
having count(*) > 1;

-- 9. Promotion and singleton loyalty-setting anomalies.
select id, name, discount_type, discount_value, audience_type, max_uses_per_customer
from public.promotions
where discount_value <= 0
   or (discount_type = 'percentage' and discount_value > 100)
order by created_at, id;

select count(*) as loyalty_settings_rows, array_agg(id order by created_at) as setting_ids
from public.loyalty_settings
having count(*) <> 1;

select id, reward_type, reward_value, visits_required, reward_expiry_days
from public.loyalty_settings
where (reward_type = 'free_service' and reward_value is not null)
   or (reward_type = 'fixed_discount' and coalesce(reward_value, 0) <= 0)
   or (reward_type = 'percentage' and (coalesce(reward_value, 0) <= 0 or reward_value > 100));

-- 10. Sales totals/semantics and appointment linkage anomalies.
select s.id, s.sale_number, s.appointment_id, s.customer_id,
       s.subtotal, s.discount_amount, s.loyalty_discount, s.tip_amount,
       s.tax_amount, s.total, s.discount_source, s.discount_type,
       s.loyalty_reward_id, a.customer_id as appointment_customer_id
from public.sales s
left join public.appointments a on a.id = s.appointment_id
where s.discount_amount > s.subtotal
   or s.loyalty_discount > s.subtotal
   or s.discount_amount + s.loyalty_discount > s.subtotal
   or s.total <> round(greatest(0, s.subtotal - s.discount_amount - s.loyalty_discount + s.tax_amount), 2)
   or s.customer_id is distinct from a.customer_id
   or (s.discount_source is null and (s.discount_amount <> 0 or s.loyalty_discount <> 0 or s.loyalty_reward_id is not null))
   or (s.discount_source = 'promotion' and (s.discount_amount <= 0 or s.loyalty_discount <> 0 or s.loyalty_reward_id is not null))
   or (s.discount_source = 'manual' and (s.discount_amount <= 0 or s.loyalty_discount <> 0 or s.loyalty_reward_id is not null))
   or (s.discount_source = 'loyalty' and (s.discount_amount <> 0 or s.loyalty_reward_id is null))
order by s.completed_at, s.id;

-- 11. Payment/refund anomalies. Zero refund tips are review candidates, not proven errors.
select p.id, p.appointment_id, p.sale_id, p.refunded_payment_id,
       p.transaction_type, p.amount, p.tip_amount, p.payment_method,
       p.cash_received, p.change_given, p.status, p.paid_at
from public.payments p
where p.tip_amount < 0 or p.tip_amount > p.amount
   or (p.payment_method <> 'cash' and (p.cash_received is not null or p.change_given is not null))
   or (p.payment_method = 'cash' and p.cash_received is not null and (
        p.cash_received < p.amount or p.change_given is distinct from round(p.cash_received - p.amount, 2)
      ))
   or (p.transaction_type = 'refund' and (p.sale_id is null or p.refunded_payment_id is null))
order by p.paid_at, p.id;

select r.id as refund_id, r.sale_id, r.refunded_payment_id,
       r.amount as refund_amount, r.tip_amount as recorded_refund_tip,
       op.amount as original_payment_amount, op.tip_amount as original_payment_tip
from public.payments r
left join public.payments op on op.id = r.refunded_payment_id
where r.transaction_type = 'refund' and r.status = 'completed'
  and r.tip_amount = 0 and coalesce(op.tip_amount, 0) > 0
order by r.paid_at, r.id;

select sale_id,
       coalesce(sum(amount) filter (where transaction_type = 'payment' and status = 'completed'), 0) as paid,
       coalesce(sum(amount) filter (where transaction_type = 'refund' and status = 'completed'), 0) as refunded
from public.payments
where sale_id is not null
group by sale_id
having coalesce(sum(amount) filter (where transaction_type = 'refund' and status = 'completed'), 0)
     > coalesce(sum(amount) filter (where transaction_type = 'payment' and status = 'completed'), 0);

-- 12. Receipt arithmetic/linkage anomalies.
select r.id, r.receipt_number, r.appointment_id, r.subtotal,
       r.discount_amount, r.tax_amount, r.tip_amount, r.total,
       r.amount_paid, r.balance, a.final_price
from public.receipts r
left join public.appointments a on a.id = r.appointment_id
where r.discount_amount > r.subtotal
   or r.total <> round(greatest(0, r.subtotal - r.discount_amount + r.tax_amount), 2)
   or r.balance < 0 or r.amount_paid < 0
   or a.id is null
order by r.issued_at, r.id;

-- 13. Constraint validation status after 005. Expected initially: convalidated = false.
select c.relname as table_name, con.conname as constraint_name,
       con.convalidated, pg_get_constraintdef(con.oid, true) as definition
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and con.conname in (
    'sales_discount_source_check', 'sales_discount_type_check',
    'sales_totals_consistent', 'sales_discount_semantics',
    'appointments_prices_consistent', 'appointments_discount_links_consistent',
    'loyalty_rewards_value_valid', 'loyalty_settings_value_valid',
    'promotions_discount_value_valid', 'payments_tip_not_greater_than_amount',
    'payments_cash_values_consistent', 'receipts_totals_consistent'
  )
order by c.relname, con.conname;
