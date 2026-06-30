-- Fix CJ Miranda account: change role from admin to intern

-- 1. Update JWT metadata in auth.users
update auth.users
set raw_user_meta_data = raw_user_meta_data || '{"role":"intern"}'::jsonb
where email = 'christianjoseph.miranda@example.com'
   or lower(raw_user_meta_data->>'name') like '%miranda%'
   or lower(raw_user_meta_data->>'full_name') like '%miranda%';

-- 2. Update intern_users table
update intern_users
set role = 'intern'
where lower(name) like '%miranda%';

-- 3. Verify
select id, name, email, role from intern_users where lower(name) like '%miranda%';
