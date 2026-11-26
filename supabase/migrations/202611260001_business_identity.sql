begin;
-- Business identity already lives in admin_settings.settings_value JSONB: no new columns/table.
-- Set only the confirmed identity; preserve UID if real, all unrelated JSON fields/rows and flags.
insert into public.admin_settings(settings_key,settings_value)
values('business','{"business_name":"1200 Hairstudio","owner_name":"Arban Shaqiri","address_line1":"Schulstrasse 2","postal_code":"8599","city":"Salmsach","country":"Switzerland","email":"1200hairstudio@gmail.com","phone":"+41 79 912 72 30"}'::jsonb)
on conflict(settings_key) do update set settings_value =
 (coalesce(public.admin_settings.settings_value,'{}'::jsonb) - array['businessName','ownerName','addressLine','postalCode']) || excluded.settings_value;
-- Clean only a placeholder UID; never invent or replace an actual registration identifier.
update public.admin_settings set settings_value=settings_value||jsonb_build_object('uid',case when coalesce(settings_value->>'business_uid','') !~* '\[\s*placeholder\s*\]' then coalesce(settings_value->>'business_uid','') else '' end)
where settings_key='business' and coalesce(settings_value->>'uid',settings_value->>'business_uid','') ~* '\[\s*placeholder\s*\]';
commit;
