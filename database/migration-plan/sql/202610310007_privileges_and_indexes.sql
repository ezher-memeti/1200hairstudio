-- 1200 Hairstudio: future privilege defaults and high-value relationship indexes.

begin;

-- Prevent future functions from becoming browser-executable merely because postgres created them.
-- Intended Data API RPCs must receive explicit EXECUTE grants in their own migrations.
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated;

-- Existing broad table grants remain unchanged for application compatibility; RLS continues to be
-- the row-level authorization boundary.

create index if not exists admin_settings_updated_by_idx
  on public.admin_settings (updated_by);
create index if not exists financial_reports_generated_by_idx
  on public.financial_reports (generated_by);
create index if not exists loyalty_rewards_redeemed_appointment_id_idx
  on public.loyalty_rewards (redeemed_appointment_id);
create index if not exists marketing_campaign_recipients_customer_id_idx
  on public.marketing_campaign_recipients (customer_id);
create index if not exists marketing_campaigns_template_id_idx
  on public.marketing_campaigns (template_id);
create index if not exists marketing_campaigns_created_by_idx
  on public.marketing_campaigns (created_by);
create index if not exists payments_created_by_idx
  on public.payments (created_by);
create index if not exists payments_register_session_id_idx
  on public.payments (register_session_id);
create index if not exists promotion_customers_customer_id_idx
  on public.promotion_customers (customer_id);
create index if not exists promotions_service_id_idx
  on public.promotions (service_id);
create index if not exists receipts_created_by_idx
  on public.receipts (created_by);
create index if not exists recurring_booking_conflicts_replacement_appointment_id_idx
  on public.recurring_booking_conflicts (replacement_appointment_id);
create index if not exists register_movements_created_by_idx
  on public.register_movements (created_by);
create index if not exists register_movements_register_session_id_idx
  on public.register_movements (register_session_id);
create index if not exists register_sessions_opened_by_idx
  on public.register_sessions (opened_by);
create index if not exists register_sessions_closed_by_idx
  on public.register_sessions (closed_by);
create index if not exists sale_items_service_id_idx
  on public.sale_items (service_id);
create index if not exists sales_created_by_idx
  on public.sales (created_by);
create index if not exists sales_loyalty_reward_id_idx
  on public.sales (loyalty_reward_id);

commit;

-- POST-MIGRATION VERIFICATION:
-- select indexname, indexdef from pg_indexes
-- where schemaname = 'public'
--   and indexname in (
--     'admin_settings_updated_by_idx', 'financial_reports_generated_by_idx',
--     'loyalty_rewards_redeemed_appointment_id_idx',
--     'marketing_campaign_recipients_customer_id_idx',
--     'marketing_campaigns_template_id_idx', 'marketing_campaigns_created_by_idx',
--     'payments_created_by_idx', 'payments_register_session_id_idx',
--     'promotion_customers_customer_id_idx', 'promotions_service_id_idx',
--     'receipts_created_by_idx',
--     'recurring_booking_conflicts_replacement_appointment_id_idx',
--     'register_movements_created_by_idx', 'register_movements_register_session_id_idx',
--     'register_sessions_opened_by_idx', 'register_sessions_closed_by_idx',
--     'sale_items_service_id_idx', 'sales_created_by_idx',
--     'sales_loyalty_reward_id_idx'
--   ) order by indexname;

-- DEPLOYMENT NOTE:
-- On a large production database, replace transaction-bound CREATE INDEX with separately reviewed
-- CREATE INDEX CONCURRENTLY statements. CONCURRENTLY cannot run inside this transaction.

-- ROLLBACK:
-- Individual indexes can be dropped after query-plan review. Do not restore permissive default
-- function privileges; explicitly grant any newly required RPC instead.

