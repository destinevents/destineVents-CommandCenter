-- AUTO-SEED-TRIGGER.SQL
-- Run ONCE in Supabase SQL Editor.
-- After this, every new auth signup automatically gets an intern_users row —
-- no more FK constraint errors when new users try to log timesheets.

-- Step 1: trigger function
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.intern_users (id, name, email, role, avatar)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'intern'),
    upper(left(coalesce(new.raw_user_meta_data->>'full_name', new.email), 2))
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
-- (fixes the new user you just added, and any others in the same state)
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

-- Verify: should show every auth user, including new signups
select name, email, role, avatar, program, school from intern_users order by role, name;
