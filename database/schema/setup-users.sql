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

-- 3. Verification query
select name, email, role, avatar, program, school from intern_users order by role, name;
