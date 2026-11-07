


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."complete_pos_checkout"("p_appointment_id" "uuid", "p_subtotal" numeric, "p_discount_amount" numeric, "p_discount_source" "text", "p_discount_type" "text", "p_discount_value" numeric, "p_discount_reason" "text", "p_loyalty_reward_id" "uuid", "p_loyalty_discount" numeric, "p_tip_amount" numeric, "p_tax_amount" numeric, "p_total" numeric, "p_payments" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."complete_pos_checkout"("p_appointment_id" "uuid", "p_subtotal" numeric, "p_discount_amount" numeric, "p_discount_source" "text", "p_discount_type" "text", "p_discount_value" numeric, "p_discount_reason" "text", "p_loyalty_reward_id" "uuid", "p_loyalty_discount" numeric, "p_tip_amount" numeric, "p_tax_amount" numeric, "p_total" numeric, "p_payments" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_guest_appointment"("p_customer_id" "uuid", "p_service_id" "uuid", "p_start_at" timestamp with time zone, "p_end_at" timestamp with time zone, "p_customer_name" "text", "p_customer_email" "text", "p_customer_phone" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_appointment_id uuid;
begin
  -- Customer must exist and must be a guest customer.
  if not exists (
    select 1
    from public.customers
    where id = p_customer_id
      and is_registered = false
      and profile_id is null
  ) then
    raise exception 'Invalid guest customer';
  end if;

  -- Service must exist and be active.
  if not exists (
    select 1
    from public.services
    where id = p_service_id
      and is_active = true
  ) then
    raise exception 'Invalid service';
  end if;

  -- Basic time validation.
  if p_end_at <= p_start_at then
    raise exception 'Invalid appointment time';
  end if;

  -- Prevent overlapping confirmed appointments.
  if exists (
    select 1
    from public.appointments
    where status = 'confirmed'
      and start_at < p_end_at
      and end_at > p_start_at
  ) then
    raise exception 'Appointment slot is no longer available';
  end if;

  insert into public.appointments (
    customer_id,
    service_id,
    start_at,
    end_at,
    status,
    customer_name,
    customer_email,
    customer_phone,
    booking_source
  )
  values (
    p_customer_id,
    p_service_id,
    p_start_at,
    p_end_at,
    'confirmed',
    nullif(trim(p_customer_name), ''),
    lower(trim(p_customer_email)),
    nullif(trim(p_customer_phone), ''),
    'customer'
  )
  returning id into v_appointment_id;

  return v_appointment_id;
end;
$$;


ALTER FUNCTION "public"."create_guest_appointment"("p_customer_id" "uuid", "p_service_id" "uuid", "p_start_at" timestamp with time zone, "p_end_at" timestamp with time zone, "p_customer_name" "text", "p_customer_email" "text", "p_customer_phone" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_available_slots"("p_service_id" "uuid", "p_date" "date", "p_slot_interval_minutes" integer DEFAULT 30) RETURNS TABLE("slot_start" timestamp with time zone, "slot_end" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_duration integer;
  v_open_time time;
  v_close_time time;
  v_is_closed boolean;
  v_start timestamptz;
  v_end timestamptz;
  v_slot_interval interval;
begin

  -- Validate configurable slot interval
  if p_slot_interval_minutes is null
     or p_slot_interval_minutes <= 0
     or p_slot_interval_minutes > 120 then
    p_slot_interval_minutes := 30;
  end if;

  v_slot_interval :=
    make_interval(mins => p_slot_interval_minutes);


  -- 1. Get maximum service duration
  select coalesce(duration_max, duration_min)
  into v_duration
  from public.services
  where id = p_service_id
    and is_active = true;

  if v_duration is null then
    return;
  end if;


  -- 2. Check date-specific exception first
  select
    is_closed,
    open_time,
    close_time
  into
    v_is_closed,
    v_open_time,
    v_close_time
  from public.availability_exceptions
  where date = p_date;


  -- 3. Otherwise use recurring weekly hours
  if not found then
    select
      is_closed,
      open_time,
      close_time
    into
      v_is_closed,
      v_open_time,
      v_close_time
    from public.business_hours
    where day_of_week =
      extract(isodow from p_date)::smallint;
  end if;


  if v_is_closed is null then
    return;
  end if;

  if v_is_closed = true then
    return;
  end if;

  if v_open_time is null
     or v_close_time is null then
    return;
  end if;


  -- 4. Build working-day timestamps in Zurich
  v_start :=
    (p_date + v_open_time)
      at time zone 'Europe/Zurich';

  v_end :=
    (p_date + v_close_time)
      at time zone 'Europe/Zurich';


  -- 5. Generate possible starting points
  return query

  with candidate_slots as (

    -- A. Configurable booking grid
    select candidate as slot_start
    from generate_series(
      v_start,
      v_end - make_interval(mins => v_duration),
      v_slot_interval
    ) as candidate


    union


    -- B. Also allow a booking immediately after
    -- an existing confirmed appointment finishes
    select a.end_at as slot_start
    from public.appointments a
    where a.status = 'confirmed'
      and a.end_at >= v_start
      and a.end_at < v_end
      and a.end_at + make_interval(mins => v_duration) <= v_end
  )

  select
    c.slot_start,
    c.slot_start + make_interval(mins => v_duration)
      as slot_end

  from candidate_slots c

  where
    c.slot_start > now()

    and c.slot_start >= v_start

    and (
      c.slot_start + make_interval(mins => v_duration)
    ) <= v_end

    and not exists (
      select 1
      from public.appointments a
      where a.status = 'confirmed'

        and a.start_at <
          c.slot_start + make_interval(mins => v_duration)

        and a.end_at > c.slot_start
    )

  order by c.slot_start;

end;
$$;


ALTER FUNCTION "public"."get_available_slots"("p_service_id" "uuid", "p_date" "date", "p_slot_interval_minutes" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_available_promotions"("p_service_id" "uuid") RETURNS TABLE("id" "uuid", "name" "text", "discount_type" "text", "discount_value" numeric, "audience_type" "text", "service_id" "uuid", "starts_at" timestamp with time zone, "expires_at" timestamp with time zone, "max_uses_per_customer" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_customer_id uuid;
  v_is_registered boolean;
begin

  -- Must be a logged-in user
  if auth.uid() is null then
    return;
  end if;

  -- Resolve the customer from the authenticated account.
  -- Never trust a customer_id coming from the browser.
  select
    c.id,
    c.is_registered
  into
    v_customer_id,
    v_is_registered
  from public.customers c
  where c.profile_id = auth.uid()
  limit 1;

  if v_customer_id is null then
    return;
  end if;

  return query
  select
    p.id,
    p.name,
    p.discount_type,
    p.discount_value,
    p.audience_type,
    p.service_id,
    p.starts_at,
    p.expires_at,
    p.max_uses_per_customer
  from public.promotions p
  where
    p.is_active = true

    and (
      p.starts_at is null
      or p.starts_at <= now()
    )

    and (
      p.expires_at is null
      or p.expires_at >= now()
    )

    and (
      p.service_id is null
      or p.service_id = p_service_id
    )

    and (

      -- ALL CUSTOMERS
      -- Unlimited usage
      p.audience_type = 'all_customers'

      or

      -- REGISTERED CUSTOMERS
      (
        p.audience_type = 'registered_customers'

        and v_is_registered = true

        and (
          p.max_uses_per_customer is null
          or (
            select count(*)
            from public.appointments a
            where a.promotion_id = p.id
              and a.customer_id = v_customer_id
              and a.status <> 'cancelled'
          ) < p.max_uses_per_customer
        )
      )

      or

      -- SELECTED CUSTOMERS
      (
        p.audience_type = 'selected_customers'

        and exists (
          select 1
          from public.promotion_customers pc
          where pc.promotion_id = p.id
            and pc.customer_id = v_customer_id
        )

        and (
          p.max_uses_per_customer is null
          or (
            select count(*)
            from public.appointments a
            where a.promotion_id = p.id
              and a.customer_id = v_customer_id
              and a.status <> 'cancelled'
          ) < p.max_uses_per_customer
        )
      )
    );

end;
$$;


ALTER FUNCTION "public"."get_my_available_promotions"("p_service_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_or_create_guest_customer"("p_full_name" "text", "p_email" "text", "p_phone" "text" DEFAULT NULL::"text", "p_marketing_consent" boolean DEFAULT false) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_customer_id uuid;
  v_email text;
begin
  v_email := lower(trim(p_email));

  -- Basic validation
  if v_email is null or v_email = '' then
    raise exception 'Email is required';
  end if;

  if p_full_name is null or trim(p_full_name) = '' then
    raise exception 'Name is required';
  end if;

  -- Find existing customer by normalized email
  select id
  into v_customer_id
  from public.customers
  where lower(email) = v_email
  limit 1;

  if v_customer_id is not null then

    update public.customers
    set
      full_name = coalesce(
        nullif(trim(p_full_name), ''),
        full_name
      ),

      phone = coalesce(
        nullif(trim(p_phone), ''),
        phone
      ),

      -- Only change marketing consent when the
      -- customer explicitly checks the checkbox.
      marketing_email_consent =
        case
          when p_marketing_consent = true then true
          else marketing_email_consent
        end,

      marketing_email_consented_at =
        case
          when p_marketing_consent = true then now()
          else marketing_email_consented_at
        end,

      marketing_email_consent_source =
        case
          when p_marketing_consent = true then 'booking_form'
          else marketing_email_consent_source
        end,

      -- Explicit re-consent removes previous unsubscribe state.
      marketing_email_unsubscribed_at =
        case
          when p_marketing_consent = true then null
          else marketing_email_unsubscribed_at
        end,

      updated_at = now()

    where id = v_customer_id;

    return v_customer_id;
  end if;

  -- Create new guest customer
  insert into public.customers (
    full_name,
    email,
    phone,
    profile_id,
    is_registered,
    marketing_email_consent,
    marketing_email_consented_at,
    marketing_email_unsubscribed_at,
    marketing_email_consent_source
  )
  values (
    trim(p_full_name),
    v_email,
    nullif(trim(p_phone), ''),
    null,
    false,
    p_marketing_consent,
    case
      when p_marketing_consent then now()
      else null
    end,
    null,
    case
      when p_marketing_consent then 'booking_form'
      else null
    end
  )
  returning id into v_customer_id;

  return v_customer_id;
end;
$$;


ALTER FUNCTION "public"."get_or_create_guest_customer"("p_full_name" "text", "p_email" "text", "p_phone" "text", "p_marketing_consent" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin

  -- Create profile
  insert into public.profiles (
    id,
    role
  )
  values (
    new.id,
    'customer'
  )
  on conflict (id) do nothing;

  -- Create customer
  insert into public.customers (
    profile_id,
    full_name,
    email,
    phone
  )
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.email
    ),
    new.email,
    new.raw_user_meta_data ->> 'phone'
  )
  on conflict (profile_id) do nothing;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refund_pos_sale"("p_sale_id" "uuid", "p_amount" numeric, "p_method" "text", "p_note" "text") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."refund_pos_sale"("p_sale_id" "uuid", "p_amount" numeric, "p_method" "text", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_admin_settings_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."update_admin_settings_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_payments_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."update_payments_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."admin_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "settings_key" "text" NOT NULL,
    "settings_value" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."admin_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."announcements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text",
    "message" "text" NOT NULL,
    "display_type" "text" DEFAULT 'top_bar'::"text" NOT NULL,
    "cta_text" "text",
    "cta_url" "text",
    "starts_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "is_active" boolean DEFAULT true NOT NULL,
    "is_dismissible" boolean DEFAULT true NOT NULL,
    "priority" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "announcements_display_type_check" CHECK (("display_type" = ANY (ARRAY['top_bar'::"text", 'booking_notice'::"text", 'modal'::"text"])))
);


ALTER TABLE "public"."announcements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."appointments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid",
    "service_id" "uuid" NOT NULL,
    "start_at" timestamp with time zone NOT NULL,
    "end_at" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'confirmed'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "guest_name" "text",
    "guest_email" "text",
    "guest_phone" "text",
    "customer_name" "text",
    "customer_email" "text",
    "customer_phone" "text",
    "booking_source" "text" DEFAULT 'customer'::"text",
    "original_price" numeric(10,2),
    "discount_amount" numeric(10,2),
    "final_price" numeric(10,2),
    "promotion_id" "uuid",
    "booking_reference" "text",
    "manage_token_hash" "text",
    "cancelled_at" timestamp with time zone,
    "discount_source" "text",
    "discount_label" "text",
    "discount_type" "text",
    "discount_value" numeric(10,2),
    "recurring_booking_id" "uuid",
    "recurring_occurrence_date" "date",
    CONSTRAINT "appointment_customer_or_guest" CHECK ((("customer_id" IS NOT NULL) OR (("guest_name" IS NOT NULL) AND ("guest_email" IS NOT NULL) AND ("guest_phone" IS NOT NULL)))),
    CONSTRAINT "appointments_booking_source_check" CHECK (("booking_source" = ANY (ARRAY['customer'::"text", 'admin'::"text"]))),
    CONSTRAINT "appointments_discount_source_check" CHECK (("discount_source" = ANY (ARRAY['promotion'::"text", 'custom'::"text"]))),
    CONSTRAINT "appointments_discount_type_check" CHECK (("discount_type" = ANY (ARRAY['percentage'::"text", 'fixed'::"text"]))),
    CONSTRAINT "appointments_status_check" CHECK (("status" = ANY (ARRAY['confirmed'::"text", 'completed'::"text", 'cancelled'::"text", 'no_show'::"text"]))),
    CONSTRAINT "valid_appointment_time" CHECK (("end_at" > "start_at"))
);


ALTER TABLE "public"."appointments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "appointment_id" "uuid" NOT NULL,
    "transaction_type" "text" DEFAULT 'payment'::"text" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "currency" "text" DEFAULT 'CHF'::"text" NOT NULL,
    "payment_method" "text" NOT NULL,
    "status" "text" DEFAULT 'completed'::"text" NOT NULL,
    "paid_at" timestamp with time zone,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "register_session_id" "uuid",
    "tip_amount" numeric(10,2) DEFAULT 0 NOT NULL,
    "sale_id" "uuid",
    "refunded_payment_id" "uuid",
    "cash_received" numeric(10,2),
    "change_given" numeric(10,2),
    CONSTRAINT "completed_payment_requires_paid_at" CHECK ((("status" <> 'completed'::"text") OR ("paid_at" IS NOT NULL))),
    CONSTRAINT "payments_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "payments_cash_received_check" CHECK ((("cash_received" IS NULL) OR ("cash_received" >= (0)::numeric))),
    CONSTRAINT "payments_change_given_check" CHECK ((("change_given" IS NULL) OR ("change_given" >= (0)::numeric))),
    CONSTRAINT "payments_currency_check" CHECK (("currency" = 'CHF'::"text")),
    CONSTRAINT "payments_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['cash'::"text", 'twint'::"text", 'card'::"text", 'bank_transfer'::"text", 'other'::"text"]))),
    CONSTRAINT "payments_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'completed'::"text", 'failed'::"text", 'voided'::"text"]))),
    CONSTRAINT "payments_transaction_type_check" CHECK (("transaction_type" = ANY (ARRAY['payment'::"text", 'refund'::"text"])))
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."appointment_finance_summary" WITH ("security_invoker"='true') AS
 SELECT "a"."id" AS "appointment_id",
    "a"."booking_reference",
    "a"."customer_id",
    "a"."service_id",
    "a"."start_at",
    "a"."end_at",
    "a"."status" AS "appointment_status",
    (COALESCE("a"."original_price", (0)::numeric))::numeric(10,2) AS "original_price",
    (COALESCE("a"."discount_amount", (0)::numeric))::numeric(10,2) AS "discount_amount",
    (COALESCE("a"."final_price", "a"."original_price", (0)::numeric))::numeric(10,2) AS "amount_due",
    (COALESCE("sum"("p"."amount") FILTER (WHERE (("p"."transaction_type" = 'payment'::"text") AND ("p"."status" = 'completed'::"text"))), (0)::numeric))::numeric(10,2) AS "total_paid",
    (COALESCE("sum"("p"."amount") FILTER (WHERE (("p"."transaction_type" = 'refund'::"text") AND ("p"."status" = 'completed'::"text"))), (0)::numeric))::numeric(10,2) AS "total_refunded",
    ((COALESCE("sum"("p"."amount") FILTER (WHERE (("p"."transaction_type" = 'payment'::"text") AND ("p"."status" = 'completed'::"text"))), (0)::numeric) - COALESCE("sum"("p"."amount") FILTER (WHERE (("p"."transaction_type" = 'refund'::"text") AND ("p"."status" = 'completed'::"text"))), (0)::numeric)))::numeric(10,2) AS "net_paid",
        CASE
            WHEN (COALESCE("a"."final_price", "a"."original_price", (0)::numeric) = (0)::numeric) THEN 'not_required'::"text"
            WHEN ((COALESCE("sum"("p"."amount") FILTER (WHERE (("p"."transaction_type" = 'payment'::"text") AND ("p"."status" = 'completed'::"text"))), (0)::numeric) - COALESCE("sum"("p"."amount") FILTER (WHERE (("p"."transaction_type" = 'refund'::"text") AND ("p"."status" = 'completed'::"text"))), (0)::numeric)) <= (0)::numeric) THEN 'unpaid'::"text"
            WHEN ((COALESCE("sum"("p"."amount") FILTER (WHERE (("p"."transaction_type" = 'payment'::"text") AND ("p"."status" = 'completed'::"text"))), (0)::numeric) - COALESCE("sum"("p"."amount") FILTER (WHERE (("p"."transaction_type" = 'refund'::"text") AND ("p"."status" = 'completed'::"text"))), (0)::numeric)) < COALESCE("a"."final_price", "a"."original_price", (0)::numeric)) THEN 'partially_paid'::"text"
            WHEN ((COALESCE("sum"("p"."amount") FILTER (WHERE (("p"."transaction_type" = 'payment'::"text") AND ("p"."status" = 'completed'::"text"))), (0)::numeric) - COALESCE("sum"("p"."amount") FILTER (WHERE (("p"."transaction_type" = 'refund'::"text") AND ("p"."status" = 'completed'::"text"))), (0)::numeric)) = COALESCE("a"."final_price", "a"."original_price", (0)::numeric)) THEN 'paid'::"text"
            ELSE 'overpaid'::"text"
        END AS "payment_status"
   FROM ("public"."appointments" "a"
     LEFT JOIN "public"."payments" "p" ON (("p"."appointment_id" = "a"."id")))
  GROUP BY "a"."id", "a"."booking_reference", "a"."customer_id", "a"."service_id", "a"."start_at", "a"."end_at", "a"."status", "a"."original_price", "a"."discount_amount", "a"."final_price";


ALTER VIEW "public"."appointment_finance_summary" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."appointment_reminders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "appointment_id" "uuid" NOT NULL,
    "appointment_start_at" timestamp with time zone NOT NULL,
    "channel" "text" NOT NULL,
    "scheduled_for" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "sent_at" timestamp with time zone,
    "error_message" "text",
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "appointment_reminders_channel_check" CHECK (("channel" = ANY (ARRAY['email'::"text", 'whatsapp'::"text"]))),
    CONSTRAINT "appointment_reminders_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'sent'::"text", 'failed'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."appointment_reminders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."availability_exceptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "date" "date" NOT NULL,
    "is_closed" boolean DEFAULT false NOT NULL,
    "open_time" time without time zone,
    "close_time" time without time zone,
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "valid_exception_hours" CHECK ((("is_closed" = true) OR (("open_time" IS NOT NULL) AND ("close_time" IS NOT NULL) AND ("close_time" > "open_time"))))
);


ALTER TABLE "public"."availability_exceptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."business_hours" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "day_of_week" smallint NOT NULL,
    "is_closed" boolean DEFAULT false NOT NULL,
    "open_time" time without time zone,
    "close_time" time without time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "business_hours_day_of_week_check" CHECK ((("day_of_week" >= 1) AND ("day_of_week" <= 7))),
    CONSTRAINT "valid_business_hours" CHECK ((("is_closed" = true) OR (("open_time" IS NOT NULL) AND ("close_time" IS NOT NULL) AND ("close_time" > "open_time"))))
);


ALTER TABLE "public"."business_hours" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contact_section_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "is_enabled" boolean DEFAULT true NOT NULL,
    "eyebrow" "text" DEFAULT 'CONTACT'::"text" NOT NULL,
    "title" "text" DEFAULT 'COME BY. STAY CONNECTED.'::"text" NOT NULL,
    "description" "text",
    "address" "text",
    "map_url" "text",
    "phone_number" "text",
    "phone_display" "text",
    "instagram_enabled" boolean DEFAULT true NOT NULL,
    "instagram_username" "text",
    "instagram_url" "text",
    "google_reviews_enabled" boolean DEFAULT true NOT NULL,
    "google_reviews_url" "text",
    "google_leave_review_url" "text",
    "call_cta_label" "text" DEFAULT 'CALL NOW'::"text" NOT NULL,
    "instagram_cta_label" "text" DEFAULT 'OPEN INSTAGRAM'::"text" NOT NULL,
    "reviews_cta_label" "text" DEFAULT 'READ REVIEWS'::"text" NOT NULL,
    "leave_review_cta_label" "text" DEFAULT 'LEAVE A REVIEW'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."contact_section_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_email_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid",
    "appointment_id" "uuid",
    "recipient_email" "text" NOT NULL,
    "customer_name" "text",
    "email_type" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "status" "text" NOT NULL,
    "sent_at" timestamp with time zone,
    "failed_at" timestamp with time zone,
    "error_message" "text",
    "provider_message_id" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "customer_email_logs_email_type_check" CHECK (("email_type" = ANY (ARRAY['appointment_confirmation'::"text", 'appointment_rescheduled'::"text", 'appointment_cancelled'::"text", 'appointment_reminder'::"text", 'regular_booking_confirmation'::"text", 'regular_booking_updated'::"text", 'regular_booking_removed'::"text", 'regular_booking_paused'::"text", 'regular_booking_resumed'::"text", 'receipt'::"text", 'marketing'::"text", 'other'::"text"]))),
    CONSTRAINT "customer_email_logs_status_check" CHECK (("status" = ANY (ARRAY['processing'::"text", 'sent'::"text", 'failed'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."customer_email_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid",
    "full_name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "phone" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_registered" boolean DEFAULT false NOT NULL,
    "marketing_email_consent" boolean DEFAULT false NOT NULL,
    "marketing_email_consented_at" timestamp with time zone,
    "marketing_email_unsubscribed_at" timestamp with time zone,
    "marketing_email_consent_source" "text"
);


ALTER TABLE "public"."customers" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."financial_report_number_seq"
    START WITH 1000
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."financial_report_number_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."financial_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "report_number" "text" DEFAULT ((('FIN-'::"text" || (EXTRACT(year FROM CURRENT_DATE))::"text") || '-'::"text") || "lpad"(("nextval"('"public"."financial_report_number_seq"'::"regclass"))::"text", 4, '0'::"text")) NOT NULL,
    "period_type" "text" NOT NULL,
    "period_start" timestamp with time zone NOT NULL,
    "period_end" timestamp with time zone NOT NULL,
    "group_by" "text" NOT NULL,
    "currency" "text" DEFAULT 'CHF'::"text" NOT NULL,
    "snapshot" "jsonb" NOT NULL,
    "generated_by" "uuid",
    "generated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "financial_reports_currency_check" CHECK (("currency" = 'CHF'::"text")),
    CONSTRAINT "financial_reports_group_by_check" CHECK (("group_by" = ANY (ARRAY['day'::"text", 'month'::"text"]))),
    CONSTRAINT "financial_reports_period_type_check" CHECK (("period_type" = ANY (ARRAY['daily'::"text", 'weekly'::"text", 'monthly'::"text", 'yearly'::"text", 'custom'::"text"]))),
    CONSTRAINT "financial_reports_valid_period" CHECK (("period_end" >= "period_start"))
);


ALTER TABLE "public"."financial_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."homepage_content" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "section" "text" NOT NULL,
    "content_key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "value" "text" NOT NULL,
    "content_type" "text" DEFAULT 'text'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "homepage_content_content_type_check" CHECK (("content_type" = ANY (ARRAY['text'::"text", 'textarea'::"text"])))
);


ALTER TABLE "public"."homepage_content" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."loyalty_rewards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "reward_type" "text" NOT NULL,
    "reward_value" numeric(10,2) NOT NULL,
    "status" "text" DEFAULT 'available'::"text" NOT NULL,
    "earned_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone,
    "redeemed_at" timestamp with time zone,
    "redeemed_appointment_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "loyalty_rewards_reward_type_check" CHECK (("reward_type" = ANY (ARRAY['fixed_discount'::"text", 'percentage'::"text", 'free_service'::"text"]))),
    CONSTRAINT "loyalty_rewards_status_check" CHECK (("status" = ANY (ARRAY['available'::"text", 'reserved'::"text", 'redeemed'::"text", 'expired'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."loyalty_rewards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."loyalty_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "is_enabled" boolean DEFAULT true NOT NULL,
    "visits_required" integer DEFAULT 10 NOT NULL,
    "reward_type" "text" DEFAULT 'fixed_discount'::"text" NOT NULL,
    "reward_value" numeric(10,2) DEFAULT 25 NOT NULL,
    "reward_expiry_days" integer,
    "reward_visit_counts_toward_next" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "loyalty_settings_reward_type_check" CHECK (("reward_type" = ANY (ARRAY['fixed_discount'::"text", 'percentage'::"text", 'free_service'::"text"])))
);


ALTER TABLE "public"."loyalty_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."loyalty_visits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "appointment_id" "uuid" NOT NULL,
    "is_eligible" boolean DEFAULT true NOT NULL,
    "excluded_reason" "text",
    "reward_cycle" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."loyalty_visits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."marketing_campaign_recipients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "customer_id" "uuid",
    "email_snapshot" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "sent_at" timestamp with time zone,
    "failure_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "marketing_campaign_recipients_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'sent'::"text", 'failed'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."marketing_campaign_recipients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."marketing_campaigns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "template_id" "uuid",
    "name" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "preheader" "text",
    "headline" "text",
    "content" "text" NOT NULL,
    "cta_text" "text",
    "cta_url" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "audience_filters" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "recipient_count" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "marketing_campaigns_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'sending'::"text", 'sent'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."marketing_campaigns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."marketing_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "default_subject" "text",
    "default_headline" "text",
    "default_content" "text",
    "default_cta_text" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "default_preheader" "text",
    "default_cta_url" "text",
    CONSTRAINT "marketing_templates_type_check" CHECK (("type" = ANY (ARRAY['special_offer'::"text", 'holiday_seasonal'::"text", 'loyal_customer_offer'::"text", 'come_back'::"text", 'blank_canvas'::"text"])))
);


ALTER TABLE "public"."marketing_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "appointment_reminders_enabled" boolean DEFAULT true NOT NULL,
    "appointment_reminder_hours_before" integer DEFAULT 2 NOT NULL,
    "appointment_reminder_email_enabled" boolean DEFAULT true NOT NULL,
    "appointment_reminder_whatsapp_enabled" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "appointment_reminder_hours_before_valid" CHECK ((("appointment_reminder_hours_before" >= 1) AND ("appointment_reminder_hours_before" <= 720)))
);


ALTER TABLE "public"."notification_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'customer'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."promotion_customers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "promotion_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."promotion_customers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."promotions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "discount_type" "text" NOT NULL,
    "discount_value" numeric(10,2) NOT NULL,
    "audience_type" "text" NOT NULL,
    "service_id" "uuid",
    "starts_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "max_uses_per_customer" integer,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "promotions_audience_type_check" CHECK (("audience_type" = ANY (ARRAY['selected_customers'::"text", 'all_customers'::"text", 'registered_customers'::"text"]))),
    CONSTRAINT "promotions_discount_type_check" CHECK (("discount_type" = ANY (ARRAY['percentage'::"text", 'fixed'::"text"]))),
    CONSTRAINT "promotions_usage_limit_check" CHECK ((("audience_type" = 'all_customers'::"text") OR (("audience_type" = ANY (ARRAY['registered_customers'::"text", 'selected_customers'::"text"])) AND ("max_uses_per_customer" IS NOT NULL) AND ("max_uses_per_customer" >= 1))))
);


ALTER TABLE "public"."promotions" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."receipt_number_seq"
    START WITH 1000
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."receipt_number_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."receipts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "appointment_id" "uuid" NOT NULL,
    "receipt_number" bigint DEFAULT "nextval"('"public"."receipt_number_seq"'::"regclass") NOT NULL,
    "customer_name" "text",
    "service_name" "text" NOT NULL,
    "service_quantity" integer DEFAULT 1 NOT NULL,
    "appointment_start_at" timestamp with time zone NOT NULL,
    "subtotal" numeric(10,2) NOT NULL,
    "discount_amount" numeric(10,2) DEFAULT 0 NOT NULL,
    "discount_label" "text",
    "total" numeric(10,2) NOT NULL,
    "amount_paid" numeric(10,2) DEFAULT 0 NOT NULL,
    "balance" numeric(10,2) DEFAULT 0 NOT NULL,
    "payment_method" "text",
    "currency" "text" DEFAULT 'CHF'::"text" NOT NULL,
    "issued_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "emailed_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tip_amount" numeric(10,2) DEFAULT 0 NOT NULL,
    "tax_amount" numeric(10,2) DEFAULT 0 NOT NULL,
    CONSTRAINT "receipts_amount_paid_check" CHECK (("amount_paid" >= (0)::numeric)),
    CONSTRAINT "receipts_discount_amount_check" CHECK (("discount_amount" >= (0)::numeric)),
    CONSTRAINT "receipts_service_quantity_check" CHECK (("service_quantity" > 0)),
    CONSTRAINT "receipts_subtotal_check" CHECK (("subtotal" >= (0)::numeric)),
    CONSTRAINT "receipts_total_check" CHECK (("total" >= (0)::numeric))
);


ALTER TABLE "public"."receipts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recurring_booking_conflicts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "recurring_booking_id" "uuid" NOT NULL,
    "occurrence_date" "date" NOT NULL,
    "reason" "text" NOT NULL,
    "status" "text" DEFAULT 'unresolved'::"text" NOT NULL,
    "replacement_appointment_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "recurring_booking_conflicts_status_check" CHECK (("status" = ANY (ARRAY['unresolved'::"text", 'rescheduled'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."recurring_booking_conflicts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recurring_bookings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "service_id" "uuid" NOT NULL,
    "frequency" "text" NOT NULL,
    "weekday" integer NOT NULL,
    "start_time" time without time zone NOT NULL,
    "starts_on" "date" NOT NULL,
    "ends_on" "date",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "paused_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "total_occurrences" integer,
    CONSTRAINT "recurring_bookings_frequency_check" CHECK (("frequency" = ANY (ARRAY['weekly'::"text", 'biweekly'::"text"]))),
    CONSTRAINT "recurring_bookings_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'completed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "recurring_bookings_weekday_check" CHECK ((("weekday" >= 0) AND ("weekday" <= 6)))
);


ALTER TABLE "public"."recurring_bookings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."register_movements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "register_session_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "note" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "register_movements_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "register_movements_type_check" CHECK (("type" = ANY (ARRAY['deposit'::"text", 'withdrawal'::"text"])))
);


ALTER TABLE "public"."register_movements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."register_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "opened_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "opened_by" "uuid" NOT NULL,
    "opening_cash" numeric(10,2) DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "closed_at" timestamp with time zone,
    "closed_by" "uuid",
    "expected_cash" numeric(10,2),
    "actual_cash" numeric(10,2),
    "difference" numeric(10,2),
    "opening_note" "text",
    "closing_note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "register_sessions_opening_cash_check" CHECK (("opening_cash" >= (0)::numeric)),
    CONSTRAINT "register_sessions_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."register_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sale_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sale_id" "uuid" NOT NULL,
    "service_id" "uuid",
    "description" "text" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "unit_price" numeric(10,2) NOT NULL,
    "subtotal" numeric(10,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "sale_items_quantity_check" CHECK (("quantity" > 0)),
    CONSTRAINT "sale_items_subtotal_check" CHECK (("subtotal" >= (0)::numeric)),
    CONSTRAINT "sale_items_unit_price_check" CHECK (("unit_price" >= (0)::numeric))
);


ALTER TABLE "public"."sale_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sale_number" bigint NOT NULL,
    "appointment_id" "uuid" NOT NULL,
    "customer_id" "uuid",
    "subtotal" numeric(10,2) NOT NULL,
    "discount_amount" numeric(10,2) DEFAULT 0 NOT NULL,
    "discount_source" "text",
    "discount_type" "text",
    "discount_value" numeric(10,2),
    "discount_reason" "text",
    "loyalty_reward_id" "uuid",
    "loyalty_discount" numeric(10,2) DEFAULT 0 NOT NULL,
    "tip_amount" numeric(10,2) DEFAULT 0 NOT NULL,
    "tax_amount" numeric(10,2) DEFAULT 0 NOT NULL,
    "total" numeric(10,2) NOT NULL,
    "status" "text" DEFAULT 'completed'::"text" NOT NULL,
    "completed_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "sales_discount_amount_check" CHECK (("discount_amount" >= (0)::numeric)),
    CONSTRAINT "sales_discount_source_check" CHECK ((("discount_source" IS NULL) OR ("discount_source" = ANY (ARRAY['promotion'::"text", 'loyalty'::"text", 'manual'::"text"])))),
    CONSTRAINT "sales_loyalty_discount_check" CHECK (("loyalty_discount" >= (0)::numeric)),
    CONSTRAINT "sales_status_check" CHECK (("status" = ANY (ARRAY['completed'::"text", 'partially_refunded'::"text", 'refunded'::"text"]))),
    CONSTRAINT "sales_subtotal_check" CHECK (("subtotal" >= (0)::numeric)),
    CONSTRAINT "sales_tax_amount_check" CHECK (("tax_amount" >= (0)::numeric)),
    CONSTRAINT "sales_tip_amount_check" CHECK (("tip_amount" >= (0)::numeric)),
    CONSTRAINT "sales_total_check" CHECK (("total" >= (0)::numeric))
);


ALTER TABLE "public"."sales" OWNER TO "postgres";


ALTER TABLE "public"."sales" ALTER COLUMN "sale_number" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."sales_sale_number_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."selected_work" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text",
    "image_url" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."selected_work" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."services" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "price" numeric(10,2) NOT NULL,
    "duration_min" integer NOT NULL,
    "duration_max" integer,
    "image_url" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."services" OWNER TO "postgres";


ALTER TABLE ONLY "public"."admin_settings"
    ADD CONSTRAINT "admin_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_settings"
    ADD CONSTRAINT "admin_settings_settings_key_key" UNIQUE ("settings_key");



ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."appointment_reminders"
    ADD CONSTRAINT "appointment_reminders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_booking_reference_key" UNIQUE ("booking_reference");



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."availability_exceptions"
    ADD CONSTRAINT "availability_exceptions_date_key" UNIQUE ("date");



ALTER TABLE ONLY "public"."availability_exceptions"
    ADD CONSTRAINT "availability_exceptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."business_hours"
    ADD CONSTRAINT "business_hours_day_of_week_key" UNIQUE ("day_of_week");



ALTER TABLE ONLY "public"."business_hours"
    ADD CONSTRAINT "business_hours_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contact_section_settings"
    ADD CONSTRAINT "contact_section_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_email_logs"
    ADD CONSTRAINT "customer_email_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_email_unique" UNIQUE ("email");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_profile_id_key" UNIQUE ("profile_id");



ALTER TABLE ONLY "public"."financial_reports"
    ADD CONSTRAINT "financial_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."financial_reports"
    ADD CONSTRAINT "financial_reports_report_number_key" UNIQUE ("report_number");



ALTER TABLE ONLY "public"."homepage_content"
    ADD CONSTRAINT "homepage_content_content_key_key" UNIQUE ("content_key");



ALTER TABLE ONLY "public"."homepage_content"
    ADD CONSTRAINT "homepage_content_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loyalty_rewards"
    ADD CONSTRAINT "loyalty_rewards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loyalty_settings"
    ADD CONSTRAINT "loyalty_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loyalty_visits"
    ADD CONSTRAINT "loyalty_visits_appointment_id_key" UNIQUE ("appointment_id");



ALTER TABLE ONLY "public"."loyalty_visits"
    ADD CONSTRAINT "loyalty_visits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."marketing_campaign_recipients"
    ADD CONSTRAINT "marketing_campaign_recipients_campaign_id_customer_id_key" UNIQUE ("campaign_id", "customer_id");



ALTER TABLE ONLY "public"."marketing_campaign_recipients"
    ADD CONSTRAINT "marketing_campaign_recipients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."marketing_campaigns"
    ADD CONSTRAINT "marketing_campaigns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."marketing_templates"
    ADD CONSTRAINT "marketing_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."marketing_templates"
    ADD CONSTRAINT "marketing_templates_type_key" UNIQUE ("type");



ALTER TABLE ONLY "public"."notification_settings"
    ADD CONSTRAINT "notification_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."promotion_customers"
    ADD CONSTRAINT "promotion_customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."promotion_customers"
    ADD CONSTRAINT "promotion_customers_promotion_id_customer_id_key" UNIQUE ("promotion_id", "customer_id");



ALTER TABLE ONLY "public"."promotions"
    ADD CONSTRAINT "promotions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."receipts"
    ADD CONSTRAINT "receipts_appointment_id_key" UNIQUE ("appointment_id");



ALTER TABLE ONLY "public"."receipts"
    ADD CONSTRAINT "receipts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."receipts"
    ADD CONSTRAINT "receipts_receipt_number_key" UNIQUE ("receipt_number");



ALTER TABLE ONLY "public"."recurring_booking_conflicts"
    ADD CONSTRAINT "recurring_booking_conflicts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recurring_booking_conflicts"
    ADD CONSTRAINT "recurring_booking_conflicts_recurring_booking_id_occurrence_key" UNIQUE ("recurring_booking_id", "occurrence_date");



ALTER TABLE ONLY "public"."recurring_bookings"
    ADD CONSTRAINT "recurring_bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."register_movements"
    ADD CONSTRAINT "register_movements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."register_sessions"
    ADD CONSTRAINT "register_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sale_items"
    ADD CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_appointment_id_key" UNIQUE ("appointment_id");



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_sale_number_key" UNIQUE ("sale_number");



ALTER TABLE ONLY "public"."selected_work"
    ADD CONSTRAINT "selected_work_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_pkey" PRIMARY KEY ("id");



CREATE INDEX "appointment_reminders_appointment_id_idx" ON "public"."appointment_reminders" USING "btree" ("appointment_id");



CREATE INDEX "appointment_reminders_scheduled_for_idx" ON "public"."appointment_reminders" USING "btree" ("scheduled_for");



CREATE INDEX "appointment_reminders_status_idx" ON "public"."appointment_reminders" USING "btree" ("status");



CREATE UNIQUE INDEX "appointment_reminders_unique_delivery" ON "public"."appointment_reminders" USING "btree" ("appointment_id", "appointment_start_at", "channel");



CREATE INDEX "appointments_customer_id_idx" ON "public"."appointments" USING "btree" ("customer_id");



CREATE UNIQUE INDEX "appointments_manage_token_hash_idx" ON "public"."appointments" USING "btree" ("manage_token_hash") WHERE ("manage_token_hash" IS NOT NULL);



CREATE INDEX "appointments_promotion_customer_idx" ON "public"."appointments" USING "btree" ("promotion_id", "customer_id");



CREATE INDEX "appointments_recurring_booking_id_idx" ON "public"."appointments" USING "btree" ("recurring_booking_id");



CREATE UNIQUE INDEX "appointments_recurring_occurrence_unique" ON "public"."appointments" USING "btree" ("recurring_booking_id", "recurring_occurrence_date") WHERE (("recurring_booking_id" IS NOT NULL) AND ("recurring_occurrence_date" IS NOT NULL));



CREATE INDEX "appointments_service_id_idx" ON "public"."appointments" USING "btree" ("service_id");



CREATE INDEX "appointments_start_at_idx" ON "public"."appointments" USING "btree" ("start_at");



CREATE INDEX "appointments_status_idx" ON "public"."appointments" USING "btree" ("status");



CREATE INDEX "customer_email_logs_appointment_idx" ON "public"."customer_email_logs" USING "btree" ("appointment_id");



CREATE INDEX "customer_email_logs_customer_idx" ON "public"."customer_email_logs" USING "btree" ("customer_id");



CREATE INDEX "customer_email_logs_sent_at_idx" ON "public"."customer_email_logs" USING "btree" ("sent_at" DESC);



CREATE INDEX "customer_email_logs_type_idx" ON "public"."customer_email_logs" USING "btree" ("email_type");



CREATE INDEX "financial_reports_generated_at_idx" ON "public"."financial_reports" USING "btree" ("generated_at" DESC);



CREATE INDEX "financial_reports_period_idx" ON "public"."financial_reports" USING "btree" ("period_start", "period_end");



CREATE INDEX "financial_reports_period_type_idx" ON "public"."financial_reports" USING "btree" ("period_type");



CREATE INDEX "financial_reports_snapshot_idx" ON "public"."financial_reports" USING "gin" ("snapshot");



CREATE INDEX "idx_announcements_active_priority_created" ON "public"."announcements" USING "btree" ("is_active", "priority" DESC, "created_at" DESC);



CREATE INDEX "idx_announcements_expires_at" ON "public"."announcements" USING "btree" ("expires_at");



CREATE INDEX "idx_announcements_starts_at" ON "public"."announcements" USING "btree" ("starts_at");



CREATE INDEX "loyalty_rewards_customer_id_idx" ON "public"."loyalty_rewards" USING "btree" ("customer_id");



CREATE INDEX "loyalty_rewards_status_idx" ON "public"."loyalty_rewards" USING "btree" ("status");



CREATE INDEX "loyalty_visits_appointment_id_idx" ON "public"."loyalty_visits" USING "btree" ("appointment_id");



CREATE INDEX "loyalty_visits_customer_id_idx" ON "public"."loyalty_visits" USING "btree" ("customer_id");



CREATE UNIQUE INDEX "one_open_register_session" ON "public"."register_sessions" USING "btree" ("status") WHERE ("status" = 'open'::"text");



CREATE INDEX "payments_appointment_id_idx" ON "public"."payments" USING "btree" ("appointment_id");



CREATE INDEX "payments_method_idx" ON "public"."payments" USING "btree" ("payment_method");



CREATE INDEX "payments_paid_at_idx" ON "public"."payments" USING "btree" ("paid_at" DESC);



CREATE INDEX "payments_refunded_payment_id_idx" ON "public"."payments" USING "btree" ("refunded_payment_id");



CREATE INDEX "payments_sale_id_idx" ON "public"."payments" USING "btree" ("sale_id");



CREATE INDEX "payments_status_idx" ON "public"."payments" USING "btree" ("status");



CREATE INDEX "payments_transaction_type_idx" ON "public"."payments" USING "btree" ("transaction_type");



CREATE INDEX "recurring_bookings_active_idx" ON "public"."recurring_bookings" USING "btree" ("is_active");



CREATE INDEX "recurring_bookings_customer_id_idx" ON "public"."recurring_bookings" USING "btree" ("customer_id");



CREATE INDEX "recurring_bookings_service_id_idx" ON "public"."recurring_bookings" USING "btree" ("service_id");



CREATE INDEX "sale_items_sale_id_idx" ON "public"."sale_items" USING "btree" ("sale_id");



CREATE INDEX "sales_completed_at_idx" ON "public"."sales" USING "btree" ("completed_at" DESC);



CREATE INDEX "sales_customer_id_idx" ON "public"."sales" USING "btree" ("customer_id");



CREATE OR REPLACE TRIGGER "admin_settings_set_updated_at" BEFORE UPDATE ON "public"."admin_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_admin_settings_updated_at"();



CREATE OR REPLACE TRIGGER "homepage_content_set_updated_at" BEFORE UPDATE ON "public"."homepage_content" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "payments_set_updated_at" BEFORE UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."update_payments_updated_at"();



ALTER TABLE ONLY "public"."admin_settings"
    ADD CONSTRAINT "admin_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."appointment_reminders"
    ADD CONSTRAINT "appointment_reminders_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_recurring_booking_id_fkey" FOREIGN KEY ("recurring_booking_id") REFERENCES "public"."recurring_bookings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."customer_email_logs"
    ADD CONSTRAINT "customer_email_logs_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."customer_email_logs"
    ADD CONSTRAINT "customer_email_logs_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."financial_reports"
    ADD CONSTRAINT "financial_reports_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."loyalty_rewards"
    ADD CONSTRAINT "loyalty_rewards_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loyalty_rewards"
    ADD CONSTRAINT "loyalty_rewards_redeemed_appointment_id_fkey" FOREIGN KEY ("redeemed_appointment_id") REFERENCES "public"."appointments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."loyalty_visits"
    ADD CONSTRAINT "loyalty_visits_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loyalty_visits"
    ADD CONSTRAINT "loyalty_visits_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."marketing_campaign_recipients"
    ADD CONSTRAINT "marketing_campaign_recipients_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."marketing_campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."marketing_campaign_recipients"
    ADD CONSTRAINT "marketing_campaign_recipients_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."marketing_campaigns"
    ADD CONSTRAINT "marketing_campaigns_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."marketing_campaigns"
    ADD CONSTRAINT "marketing_campaigns_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."marketing_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_refunded_payment_id_fkey" FOREIGN KEY ("refunded_payment_id") REFERENCES "public"."payments"("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_register_session_id_fkey" FOREIGN KEY ("register_session_id") REFERENCES "public"."register_sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."promotion_customers"
    ADD CONSTRAINT "promotion_customers_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."promotion_customers"
    ADD CONSTRAINT "promotion_customers_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."promotions"
    ADD CONSTRAINT "promotions_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."receipts"
    ADD CONSTRAINT "receipts_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."receipts"
    ADD CONSTRAINT "receipts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."recurring_booking_conflicts"
    ADD CONSTRAINT "recurring_booking_conflicts_recurring_booking_id_fkey" FOREIGN KEY ("recurring_booking_id") REFERENCES "public"."recurring_bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recurring_booking_conflicts"
    ADD CONSTRAINT "recurring_booking_conflicts_replacement_appointment_id_fkey" FOREIGN KEY ("replacement_appointment_id") REFERENCES "public"."appointments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."recurring_bookings"
    ADD CONSTRAINT "recurring_bookings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recurring_bookings"
    ADD CONSTRAINT "recurring_bookings_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."register_movements"
    ADD CONSTRAINT "register_movements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."register_movements"
    ADD CONSTRAINT "register_movements_register_session_id_fkey" FOREIGN KEY ("register_session_id") REFERENCES "public"."register_sessions"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."register_sessions"
    ADD CONSTRAINT "register_sessions_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."register_sessions"
    ADD CONSTRAINT "register_sessions_opened_by_fkey" FOREIGN KEY ("opened_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."sale_items"
    ADD CONSTRAINT "sale_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id");



ALTER TABLE ONLY "public"."sale_items"
    ADD CONSTRAINT "sale_items_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id");



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id");



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_loyalty_reward_id_fkey" FOREIGN KEY ("loyalty_reward_id") REFERENCES "public"."loyalty_rewards"("id");



CREATE POLICY "Admins can create admin settings" ON "public"."admin_settings" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can create announcements" ON "public"."announcements" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can create appointments" ON "public"."appointments" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can create customers" ON "public"."customers" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can create financial reports" ON "public"."financial_reports" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can create marketing templates" ON "public"."marketing_templates" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can create payments" ON "public"."payments" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can create promotion customers" ON "public"."promotion_customers" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can create promotions" ON "public"."promotions" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can create receipts" ON "public"."receipts" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can create register movements" ON "public"."register_movements" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can create register sessions" ON "public"."register_sessions" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can delete announcements" ON "public"."announcements" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can delete appointments" ON "public"."appointments" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can delete availability exceptions" ON "public"."availability_exceptions" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can delete customer email logs" ON "public"."customer_email_logs" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can delete customers" ON "public"."customers" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can delete marketing templates" ON "public"."marketing_templates" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can delete payments" ON "public"."payments" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can delete promotion customers" ON "public"."promotion_customers" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can delete promotions" ON "public"."promotions" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can delete selected work" ON "public"."selected_work" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can delete services" ON "public"."services" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can insert availability exceptions" ON "public"."availability_exceptions" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can insert contact section settings" ON "public"."contact_section_settings" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can insert loyalty settings" ON "public"."loyalty_settings" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can insert selected work" ON "public"."selected_work" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can insert services" ON "public"."services" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage campaign recipients" ON "public"."marketing_campaign_recipients" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage loyalty rewards" ON "public"."loyalty_rewards" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage marketing campaigns" ON "public"."marketing_campaigns" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage recurring bookings" ON "public"."recurring_bookings" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can read admin settings" ON "public"."admin_settings" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can read all announcements" ON "public"."announcements" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can read all customers" ON "public"."customers" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can read appointment reminders" ON "public"."appointment_reminders" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can read appointments" ON "public"."appointments" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can read customer email logs" ON "public"."customer_email_logs" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can read financial reports" ON "public"."financial_reports" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can read marketing templates" ON "public"."marketing_templates" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can read notification settings" ON "public"."notification_settings" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can read payments" ON "public"."payments" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can read promotion customers" ON "public"."promotion_customers" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can read promotions" ON "public"."promotions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can read receipts" ON "public"."receipts" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can update admin settings" ON "public"."admin_settings" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can update announcements" ON "public"."announcements" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can update appointments" ON "public"."appointments" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can update availability exceptions" ON "public"."availability_exceptions" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can update business hours" ON "public"."business_hours" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can update contact section settings" ON "public"."contact_section_settings" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can update customer email logs" ON "public"."customer_email_logs" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can update customers" ON "public"."customers" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can update homepage content" ON "public"."homepage_content" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can update loyalty settings" ON "public"."loyalty_settings" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can update marketing templates" ON "public"."marketing_templates" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can update notification settings" ON "public"."notification_settings" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can update payments" ON "public"."payments" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can update promotion customers" ON "public"."promotion_customers" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can update promotions" ON "public"."promotions" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can update receipts" ON "public"."receipts" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can update register sessions" ON "public"."register_sessions" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can update selected work" ON "public"."selected_work" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can update services" ON "public"."services" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can view register movements" ON "public"."register_movements" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can view register sessions" ON "public"."register_sessions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins manage sale items" ON "public"."sale_items" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins manage sales" ON "public"."sales" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Anyone can read availability exceptions" ON "public"."availability_exceptions" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Anyone can read business hours" ON "public"."business_hours" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Customers can create own appointments" ON "public"."appointments" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."customers" "c"
  WHERE (("c"."id" = "appointments"."customer_id") AND ("c"."profile_id" = "auth"."uid"())))) AND ("status" = 'confirmed'::"text")));



CREATE POLICY "Customers can create own recurring bookings" ON "public"."recurring_bookings" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."customers" "c"
  WHERE (("c"."id" = "recurring_bookings"."customer_id") AND ("c"."profile_id" = "auth"."uid"())))));



CREATE POLICY "Customers can read loyalty settings" ON "public"."loyalty_settings" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Customers can read own appointments" ON "public"."appointments" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."customers" "c"
  WHERE (("c"."id" = "appointments"."customer_id") AND ("c"."profile_id" = "auth"."uid"())))));



CREATE POLICY "Customers can read own record" ON "public"."customers" FOR SELECT TO "authenticated" USING (("profile_id" = "auth"."uid"()));



CREATE POLICY "Customers can update own record" ON "public"."customers" FOR UPDATE TO "authenticated" USING (("profile_id" = "auth"."uid"())) WITH CHECK (("profile_id" = "auth"."uid"()));



CREATE POLICY "Customers can update own recurring bookings" ON "public"."recurring_bookings" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."customers" "c"
  WHERE (("c"."id" = "recurring_bookings"."customer_id") AND ("c"."profile_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."customers" "c"
  WHERE (("c"."id" = "recurring_bookings"."customer_id") AND ("c"."profile_id" = "auth"."uid"())))));



CREATE POLICY "Customers can view own loyalty rewards" ON "public"."loyalty_rewards" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."customers" "c"
  WHERE (("c"."id" = "loyalty_rewards"."customer_id") AND ("c"."profile_id" = "auth"."uid"())))));



CREATE POLICY "Customers can view own loyalty visits" ON "public"."loyalty_visits" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."customers" "c"
  WHERE (("c"."id" = "loyalty_visits"."customer_id") AND ("c"."profile_id" = "auth"."uid"())))));



CREATE POLICY "Customers can view own recurring bookings" ON "public"."recurring_bookings" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."customers" "c"
  WHERE (("c"."id" = "recurring_bookings"."customer_id") AND ("c"."profile_id" = "auth"."uid"())))));



CREATE POLICY "Homepage content is publicly readable" ON "public"."homepage_content" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Public can read active announcements" ON "public"."announcements" FOR SELECT TO "authenticated", "anon" USING ((("is_active" = true) AND (("starts_at" IS NULL) OR ("starts_at" <= "now"())) AND (("expires_at" IS NULL) OR ("expires_at" >= "now"()))));



CREATE POLICY "Public can read active selected work" ON "public"."selected_work" FOR SELECT TO "authenticated", "anon" USING ((("is_active" = true) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))));



CREATE POLICY "Public can read active services" ON "public"."services" FOR SELECT TO "authenticated", "anon" USING ((("is_active" = true) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))));



CREATE POLICY "Public can read all customer promotions" ON "public"."promotions" FOR SELECT TO "authenticated", "anon" USING ((("is_active" = true) AND ("audience_type" = 'all_customers'::"text") AND (("starts_at" IS NULL) OR ("starts_at" <= "now"())) AND (("expires_at" IS NULL) OR ("expires_at" >= "now"()))));



CREATE POLICY "Public can read contact section settings" ON "public"."contact_section_settings" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "TEMP test services read" ON "public"."services" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Users can read own profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."admin_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."announcements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."appointment_reminders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."appointments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."availability_exceptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."business_hours" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contact_section_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer_email_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."financial_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."homepage_content" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."loyalty_rewards" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."loyalty_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."loyalty_visits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."marketing_campaign_recipients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."marketing_campaigns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."marketing_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."promotion_customers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."promotions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."receipts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recurring_booking_conflicts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recurring_bookings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."register_movements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."register_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sale_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sales" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."selected_work" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."services" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."complete_pos_checkout"("p_appointment_id" "uuid", "p_subtotal" numeric, "p_discount_amount" numeric, "p_discount_source" "text", "p_discount_type" "text", "p_discount_value" numeric, "p_discount_reason" "text", "p_loyalty_reward_id" "uuid", "p_loyalty_discount" numeric, "p_tip_amount" numeric, "p_tax_amount" numeric, "p_total" numeric, "p_payments" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."complete_pos_checkout"("p_appointment_id" "uuid", "p_subtotal" numeric, "p_discount_amount" numeric, "p_discount_source" "text", "p_discount_type" "text", "p_discount_value" numeric, "p_discount_reason" "text", "p_loyalty_reward_id" "uuid", "p_loyalty_discount" numeric, "p_tip_amount" numeric, "p_tax_amount" numeric, "p_total" numeric, "p_payments" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_pos_checkout"("p_appointment_id" "uuid", "p_subtotal" numeric, "p_discount_amount" numeric, "p_discount_source" "text", "p_discount_type" "text", "p_discount_value" numeric, "p_discount_reason" "text", "p_loyalty_reward_id" "uuid", "p_loyalty_discount" numeric, "p_tip_amount" numeric, "p_tax_amount" numeric, "p_total" numeric, "p_payments" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_guest_appointment"("p_customer_id" "uuid", "p_service_id" "uuid", "p_start_at" timestamp with time zone, "p_end_at" timestamp with time zone, "p_customer_name" "text", "p_customer_email" "text", "p_customer_phone" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_guest_appointment"("p_customer_id" "uuid", "p_service_id" "uuid", "p_start_at" timestamp with time zone, "p_end_at" timestamp with time zone, "p_customer_name" "text", "p_customer_email" "text", "p_customer_phone" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_guest_appointment"("p_customer_id" "uuid", "p_service_id" "uuid", "p_start_at" timestamp with time zone, "p_end_at" timestamp with time zone, "p_customer_name" "text", "p_customer_email" "text", "p_customer_phone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_guest_appointment"("p_customer_id" "uuid", "p_service_id" "uuid", "p_start_at" timestamp with time zone, "p_end_at" timestamp with time zone, "p_customer_name" "text", "p_customer_email" "text", "p_customer_phone" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_available_slots"("p_service_id" "uuid", "p_date" "date", "p_slot_interval_minutes" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_available_slots"("p_service_id" "uuid", "p_date" "date", "p_slot_interval_minutes" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_available_slots"("p_service_id" "uuid", "p_date" "date", "p_slot_interval_minutes" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_my_available_promotions"("p_service_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_available_promotions"("p_service_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_available_promotions"("p_service_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_available_promotions"("p_service_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_or_create_guest_customer"("p_full_name" "text", "p_email" "text", "p_phone" "text", "p_marketing_consent" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_or_create_guest_customer"("p_full_name" "text", "p_email" "text", "p_phone" "text", "p_marketing_consent" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."get_or_create_guest_customer"("p_full_name" "text", "p_email" "text", "p_phone" "text", "p_marketing_consent" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_or_create_guest_customer"("p_full_name" "text", "p_email" "text", "p_phone" "text", "p_marketing_consent" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."refund_pos_sale"("p_sale_id" "uuid", "p_amount" numeric, "p_method" "text", "p_note" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."refund_pos_sale"("p_sale_id" "uuid", "p_amount" numeric, "p_method" "text", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."refund_pos_sale"("p_sale_id" "uuid", "p_amount" numeric, "p_method" "text", "p_note" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_admin_settings_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_admin_settings_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_admin_settings_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_payments_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_payments_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_payments_updated_at"() TO "service_role";



GRANT ALL ON TABLE "public"."admin_settings" TO "anon";
GRANT ALL ON TABLE "public"."admin_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_settings" TO "service_role";



GRANT ALL ON TABLE "public"."announcements" TO "anon";
GRANT ALL ON TABLE "public"."announcements" TO "authenticated";
GRANT ALL ON TABLE "public"."announcements" TO "service_role";



GRANT ALL ON TABLE "public"."appointments" TO "anon";
GRANT ALL ON TABLE "public"."appointments" TO "authenticated";
GRANT ALL ON TABLE "public"."appointments" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."appointment_finance_summary" TO "anon";
GRANT ALL ON TABLE "public"."appointment_finance_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."appointment_finance_summary" TO "service_role";



GRANT ALL ON TABLE "public"."appointment_reminders" TO "anon";
GRANT ALL ON TABLE "public"."appointment_reminders" TO "authenticated";
GRANT ALL ON TABLE "public"."appointment_reminders" TO "service_role";



GRANT ALL ON TABLE "public"."availability_exceptions" TO "anon";
GRANT ALL ON TABLE "public"."availability_exceptions" TO "authenticated";
GRANT ALL ON TABLE "public"."availability_exceptions" TO "service_role";



GRANT ALL ON TABLE "public"."business_hours" TO "anon";
GRANT ALL ON TABLE "public"."business_hours" TO "authenticated";
GRANT ALL ON TABLE "public"."business_hours" TO "service_role";



GRANT ALL ON TABLE "public"."contact_section_settings" TO "anon";
GRANT ALL ON TABLE "public"."contact_section_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."contact_section_settings" TO "service_role";



GRANT ALL ON TABLE "public"."customer_email_logs" TO "anon";
GRANT ALL ON TABLE "public"."customer_email_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_email_logs" TO "service_role";



GRANT ALL ON TABLE "public"."customers" TO "anon";
GRANT ALL ON TABLE "public"."customers" TO "authenticated";
GRANT ALL ON TABLE "public"."customers" TO "service_role";



GRANT ALL ON SEQUENCE "public"."financial_report_number_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."financial_report_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."financial_report_number_seq" TO "service_role";



GRANT ALL ON TABLE "public"."financial_reports" TO "anon";
GRANT ALL ON TABLE "public"."financial_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."financial_reports" TO "service_role";



GRANT ALL ON TABLE "public"."homepage_content" TO "anon";
GRANT ALL ON TABLE "public"."homepage_content" TO "authenticated";
GRANT ALL ON TABLE "public"."homepage_content" TO "service_role";



GRANT ALL ON TABLE "public"."loyalty_rewards" TO "anon";
GRANT ALL ON TABLE "public"."loyalty_rewards" TO "authenticated";
GRANT ALL ON TABLE "public"."loyalty_rewards" TO "service_role";



GRANT ALL ON TABLE "public"."loyalty_settings" TO "anon";
GRANT ALL ON TABLE "public"."loyalty_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."loyalty_settings" TO "service_role";



GRANT ALL ON TABLE "public"."loyalty_visits" TO "anon";
GRANT ALL ON TABLE "public"."loyalty_visits" TO "authenticated";
GRANT ALL ON TABLE "public"."loyalty_visits" TO "service_role";



GRANT ALL ON TABLE "public"."marketing_campaign_recipients" TO "anon";
GRANT ALL ON TABLE "public"."marketing_campaign_recipients" TO "authenticated";
GRANT ALL ON TABLE "public"."marketing_campaign_recipients" TO "service_role";



GRANT ALL ON TABLE "public"."marketing_campaigns" TO "anon";
GRANT ALL ON TABLE "public"."marketing_campaigns" TO "authenticated";
GRANT ALL ON TABLE "public"."marketing_campaigns" TO "service_role";



GRANT ALL ON TABLE "public"."marketing_templates" TO "anon";
GRANT ALL ON TABLE "public"."marketing_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."marketing_templates" TO "service_role";



GRANT ALL ON TABLE "public"."notification_settings" TO "anon";
GRANT ALL ON TABLE "public"."notification_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_settings" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."promotion_customers" TO "anon";
GRANT ALL ON TABLE "public"."promotion_customers" TO "authenticated";
GRANT ALL ON TABLE "public"."promotion_customers" TO "service_role";



GRANT ALL ON TABLE "public"."promotions" TO "anon";
GRANT ALL ON TABLE "public"."promotions" TO "authenticated";
GRANT ALL ON TABLE "public"."promotions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."receipt_number_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."receipt_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."receipt_number_seq" TO "service_role";



GRANT ALL ON TABLE "public"."receipts" TO "anon";
GRANT ALL ON TABLE "public"."receipts" TO "authenticated";
GRANT ALL ON TABLE "public"."receipts" TO "service_role";



GRANT ALL ON TABLE "public"."recurring_booking_conflicts" TO "anon";
GRANT ALL ON TABLE "public"."recurring_booking_conflicts" TO "authenticated";
GRANT ALL ON TABLE "public"."recurring_booking_conflicts" TO "service_role";



GRANT ALL ON TABLE "public"."recurring_bookings" TO "anon";
GRANT ALL ON TABLE "public"."recurring_bookings" TO "authenticated";
GRANT ALL ON TABLE "public"."recurring_bookings" TO "service_role";



GRANT ALL ON TABLE "public"."register_movements" TO "anon";
GRANT ALL ON TABLE "public"."register_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."register_movements" TO "service_role";



GRANT ALL ON TABLE "public"."register_sessions" TO "anon";
GRANT ALL ON TABLE "public"."register_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."register_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."sale_items" TO "anon";
GRANT ALL ON TABLE "public"."sale_items" TO "authenticated";
GRANT ALL ON TABLE "public"."sale_items" TO "service_role";



GRANT ALL ON TABLE "public"."sales" TO "anon";
GRANT ALL ON TABLE "public"."sales" TO "authenticated";
GRANT ALL ON TABLE "public"."sales" TO "service_role";



GRANT ALL ON SEQUENCE "public"."sales_sale_number_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."sales_sale_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."sales_sale_number_seq" TO "service_role";



GRANT ALL ON TABLE "public"."selected_work" TO "anon";
GRANT ALL ON TABLE "public"."selected_work" TO "authenticated";
GRANT ALL ON TABLE "public"."selected_work" TO "service_role";



GRANT ALL ON TABLE "public"."services" TO "anon";
GRANT ALL ON TABLE "public"."services" TO "authenticated";
GRANT ALL ON TABLE "public"."services" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







