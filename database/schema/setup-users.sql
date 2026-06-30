-- SETUP-USERS.SQL
-- Run once in Supabase SQL Editor after intern-schema.sql
-- Seeds intern_users with existing auth.users and updates JWT metadata

-- 1. Update Jenn's JWT metadata to include role and full_name
update auth.users
set raw_user_meta_data = raw_user_meta_data || '{"role":"admin","full_name":"Jennifer Castro"}'::jsonb
where email = 'jenncastro@destinevents.biz';

-- 2. Seed intern_users table
-- Jenn Castro — admin
insert into intern_users (id, name, email, role, avatar)
select id, 'Jennifer Castro', email, 'admin', 'JC'
from auth.users
where email = 'jenncastro@destinevents.biz'
on conflict (id) do update set
  name   = excluded.name,
  email  = excluded.email,
  role   = excluded.role,
  avatar = excluded.avatar;

-- Rey — supervisor
insert into intern_users (id, name, email, role, avatar)
select id, 'Rey', email, 'supervisor', 'RE'
from auth.users
where email = 'amiananventures@gmail.com'
on conflict (id) do update set
  name   = excluded.name,
  email  = excluded.email,
  role   = excluded.role,
  avatar = excluded.avatar;

-- Mary Keirstin Ante — intern, IT, BSU
insert into intern_users (id, name, email, role, avatar, program, school)
select id, 'Mary Keirstin Ante', email, 'intern', 'MK', 'IT', 'UC'
from auth.users
where email = 'marykeirstin.ante@example.com'
on conflict (id) do update set
  name    = excluded.name,
  email   = excluded.email,
  role    = excluded.role,
  avatar  = excluded.avatar,
  program = excluded.program,
  school  = excluded.school;

-- Derick Myles Mercado — intern, IT, BSU
insert into intern_users (id, name, email, role, avatar, program, school)
select id, 'Derick Myles Mercado', email, 'intern', 'DM', 'IT', 'UC'
from auth.users
where email = 'derickmyles.mercado@example.com'
on conflict (id) do update set
  name    = excluded.name,
  email   = excluded.email,
  role    = excluded.role,
  avatar  = excluded.avatar,
  program = excluded.program,
  school  = excluded.school;

-- Ethan Wilvic Bernabe — intern, IT, BSU
insert into intern_users (id, name, email, role, avatar, program, school)
select id, 'Ethan Wilvic Bernabe', email, 'intern', 'EW', 'IT', 'BSU'
from auth.users
where email = 'ethanwilvic.bernabe@example.com'
on conflict (id) do update set
  name    = excluded.name,
  email   = excluded.email,
  role    = excluded.role,
  avatar  = excluded.avatar,
  program = excluded.program,
  school  = excluded.school;

-- Christian Joseph Miranda — intern, IT, BSU
insert into intern_users (id, name, email, role, avatar, program, school)
select id, 'Christian Joseph Miranda', email, 'intern', 'CJ', 'IT', 'BSU'
from auth.users
where email = 'christianjoseph.miranda@example.com'
on conflict (id) do update set
  name    = excluded.name,
  email   = excluded.email,
  role    = excluded.role,
  avatar  = excluded.avatar,
  program = excluded.program,
  school  = excluded.school;

-- 3. Catch-all: seed any auth user not yet in intern_users
-- Fixes interns whose real signup email doesn't match a placeholder above.
-- Uses full_name / role from user_metadata when available; falls back to email prefix.
-- program/school will be NULL and can be updated manually afterward.
insert into intern_users (id, name, email, role, avatar)
select
  au.id,
  coalesce(au.raw_user_meta_data->>'full_name', split_part(au.email,'@',1)),
  au.email,
  coalesce(au.raw_user_meta_data->>'role', 'intern'),
  upper(left(coalesce(au.raw_user_meta_data->>'full_name', au.email), 2))
from auth.users au
where not exists (
  select 1 from intern_users iu where iu.id = au.id
)
on conflict (id) do nothing;

-- 4. Verification query
select name, email, role, avatar, program, school from intern_users order by role, name;
