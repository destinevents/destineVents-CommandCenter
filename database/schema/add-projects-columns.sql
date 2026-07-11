-- ADD-PROJECTS-COLUMNS.SQL
-- Run in Supabase → SQL Editor
-- Adds columns that were missing from the original projects table creation.
-- Safe to re-run (uses IF NOT EXISTS).

alter table projects add column if not exists brand      text;
alter table projects add column if not exists category   text;
alter table projects add column if not exists updated_at timestamptz default now();

-- Reload the PostgREST schema cache so the new columns are visible immediately
-- (avoids "column not found in schema cache" until the next auto-reload)
notify pgrst, 'reload schema';
