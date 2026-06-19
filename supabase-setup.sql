-- DestineVents Command Center — Supabase Setup
-- Run this in Supabase → SQL Editor

-- CLIENTS
create table if not exists clients (
  id          bigint primary key default extract(epoch from now())::bigint,
  name        text not null,
  type        text,
  brand       text,
  status      text default 'Lead',
  contact     text,
  email       text,
  total_value numeric default 0,
  created_at  timestamptz default now()
);

-- PROPOSALS
create table if not exists proposals (
  id        bigint primary key default extract(epoch from now())::bigint,
  name      text not null,
  client    text,
  value     numeric default 0,
  sent      text,
  followup  text,
  status    text default 'Sent',
  created_at timestamptz default now()
);

-- PARTNERS
create table if not exists partners (
  id         bigint primary key default extract(epoch from now())::bigint,
  name       text not null,
  type       text,
  contact    text,
  email      text,
  created_at timestamptz default now()
);

-- INVOICES (Accounts Receivable)
create table if not exists invoices (
  id         bigint primary key default extract(epoch from now())::bigint,
  or_num     text not null,
  client     text,
  amount     numeric default 0,
  date       text,
  due        text,
  status     text default 'Unpaid',
  created_at timestamptz default now()
);

-- BILLS (Accounts Payable)
create table if not exists bills (
  id         bigint primary key default extract(epoch from now())::bigint,
  payee      text not null,
  amount     numeric default 0,
  date       text,
  category   text,
  ewt        text default '0%',
  status     text default 'Unpaid',
  created_at timestamptz default now()
);

-- PAYROLL RUNS
create table if not exists payroll_runs (
  id          bigint primary key default extract(epoch from now())::bigint,
  period      text not null,
  employees   int default 0,
  gross       numeric default 0,
  deductions  numeric default 0,
  net         numeric default 0,
  status      text default 'Pending',
  created_at  timestamptz default now()
);

-- DOCUMENTS (metadata only — files stored in Supabase Storage)
create table if not exists documents (
  id         bigint primary key default extract(epoch from now())::bigint,
  name       text not null,
  type       text,
  size       text,
  date       text,
  url        text,
  path       text,
  created_at timestamptz default now()
);

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────────────────────
-- Locks every table so only authenticated (logged-in) users can read/write.
-- Without these policies, anyone with the anon key could query your data.

alter table clients      enable row level security;
alter table proposals    enable row level security;
alter table partners     enable row level security;
alter table invoices     enable row level security;
alter table bills        enable row level security;
alter table payroll_runs enable row level security;
alter table documents    enable row level security;

-- Allow any authenticated user to do everything (internal tool — single team)
create policy "auth_all" on clients      for all to authenticated using (true) with check (true);
create policy "auth_all" on proposals    for all to authenticated using (true) with check (true);
create policy "auth_all" on partners     for all to authenticated using (true) with check (true);
create policy "auth_all" on invoices     for all to authenticated using (true) with check (true);
create policy "auth_all" on bills        for all to authenticated using (true) with check (true);
create policy "auth_all" on payroll_runs for all to authenticated using (true) with check (true);
create policy "auth_all" on documents    for all to authenticated using (true) with check (true);

-- ─── REALTIME ────────────────────────────────────────────────────────────────
-- Enable real-time updates for all tables (run this in SQL Editor)
alter publication supabase_realtime add table clients;
alter publication supabase_realtime add table proposals;
alter publication supabase_realtime add table partners;
alter publication supabase_realtime add table invoices;
alter publication supabase_realtime add table bills;
alter publication supabase_realtime add table payroll_runs;
alter publication supabase_realtime add table documents;

-- ─── STORAGE BUCKET (for Document Vault file uploads) ────────────────────────
-- Run this separately in Supabase → Storage → New Bucket
-- Bucket name: documents
-- Set to Private (not public)
-- Then add this storage policy:

-- insert into storage.buckets (id, name, public) values ('documents', 'documents', false);
-- create policy "auth_storage" on storage.objects for all to authenticated using (bucket_id = 'documents') with check (bucket_id = 'documents');
