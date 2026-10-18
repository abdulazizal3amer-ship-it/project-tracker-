-- =====================================================================
-- seed.sql — first admin account
--
-- 1. Supabase Dashboard → Authentication → Users → "Add user"
--    (email + password, tick "Auto Confirm User").
-- 2. Replace the email below and run this script in the SQL editor.
-- The admin then creates every other account from the Users screen.
-- =====================================================================
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role": "admin"}'::jsonb
where email = 'admin@example.com';

update public.users
set role = 'admin',
    full_name = 'مدير النظام',
    must_change_password = false
where email = 'admin@example.com';

select id, full_name, email, role from public.users where role = 'admin';
