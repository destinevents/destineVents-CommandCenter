-- DestineVents Command Center — Projects & Impact Tables
-- Run this in Supabase → SQL Editor

-- PROJECTS
create table if not exists projects (
  id          bigint primary key default extract(epoch from now())::bigint,
  name        text not null,
  client      text,
  brand       text,
  category    text,  -- Events, Training, Digital, CSR, Community
  value       numeric default 0,
  status      text default 'Lead',  -- Lead, Proposal Sent, NDA Signed, Active, Completed
  notes       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- IMPACT ENTRIES (per program, per period — as described in handout §3)
create table if not exists impact_entries (
  id                bigint primary key default extract(epoch from now())::bigint,
  period            text not null,   -- e.g. "Q1 2026"
  program           text not null,   -- e.g. "Digital Brew / DDC"
  students_reached  int default 0,
  teachers_trained  int default 0,
  smes_supported    int default 0,
  lgus_engaged      int default 0,
  created_at        timestamptz default now()
);

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────────────────────
alter table projects       enable row level security;
alter table impact_entries enable row level security;

drop policy if exists "admin_only" on projects;
drop policy if exists "admin_only" on impact_entries;

create policy "admin_only" on projects for all to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

create policy "admin_only" on impact_entries for all to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- ─── REALTIME ────────────────────────────────────────────────────────────────
alter publication supabase_realtime add table projects;
alter publication supabase_realtime add table impact_entries;
