-- HQ Role System Expansion
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- Safe to run on existing data: existing users (admin, supervisor, intern) are unaffected.

-- 1. Expand the role check constraint to include new HQ roles and pending state
ALTER TABLE intern_users DROP CONSTRAINT IF EXISTS intern_users_role_check;
ALTER TABLE intern_users ADD CONSTRAINT intern_users_role_check
  CHECK (role IN ('admin','supervisor','intern','pending','finance_officer','external_accountant','team_staff'));

-- 2. Add requested_role column (captures what the user selected at signup, for Jenn to review)
ALTER TABLE intern_users ADD COLUMN IF NOT EXISTS requested_role text
  CHECK (requested_role IN ('supervisor','intern','finance_officer','external_accountant','team_staff'));

-- 3. Update trigger: new signups always start as 'pending'; store their intended role
CREATE OR REPLACE FUNCTION handle_new_intern_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO intern_users (id, name, email, role, requested_role)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'name',
      NEW.raw_user_meta_data->>'full_name',
      split_part(NEW.email, '@', 1)
    ),
    NEW.email,
    'pending',
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'requested_role', ''), 'intern')
  )
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
  RETURN NEW;
END;
$$;
