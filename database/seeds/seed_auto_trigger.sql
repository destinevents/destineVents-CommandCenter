-- AUTO-SEED-TRIGGER.SQL
-- Run ONCE in Supabase SQL Editor.
-- After this, every new auth signup automatically gets an intern_users row —
-- no more FK constraint errors when new users try to log timesheets.

-- Step 1: trigger function
-- Handles both 'name' (signup form) and 'full_name' (manual SQL seeds) metadata keys.
-- Also writes program and school captured at signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_name text;
begin
  -- signup.js sends 'name'; manual seeds use 'full_name' — check both
  v_name := coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    split_part(new.email,'@',1)
  );

  -- Role is always 'intern' — never read from user_metadata, which users can
  -- self-edit (privilege escalation). Admins promote via intern_users directly.
  insert into public.intern_users (id, name, email, role, avatar, program, school)
  values (
    new.id,
    v_name,
    new.email,
    'intern',
    upper(left(v_name, 2)),
    new.raw_user_meta_data->>'program',
    new.raw_user_meta_data->>'school'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Step 2: attach trigger to auth.users
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Step 3: back-fill any existing auth users not yet in intern_users
-- (fixes users who signed up before the trigger was active)
insert into intern_users (id, name, email, role, avatar, program, school)
select
  au.id,
  coalesce(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name', split_part(au.email,'@',1)),
  au.email,
  'intern',
  upper(left(coalesce(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name', split_part(au.email,'@',1)), 2)),
  au.raw_user_meta_data->>'program',
  au.raw_user_meta_data->>'school'
from auth.users au
where not exists (
  select 1 from intern_users iu where iu.id = au.id
)
on conflict (id) do nothing;

-- Verify: should show every auth user, including new signups
select name, email, role, avatar, program, school from intern_users order by role, name;
