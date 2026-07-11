-- EVENTS MODULE — run in Supabase → SQL Editor

-- EVENTS
create table if not exists events (
  id          bigint primary key default extract(epoch from now())::bigint,
  name        text not null,
  brand       text not null,
  event_type  text,
  date        text,
  venue       text,
  capacity    int default 0,
  price       numeric default 0,
  status      text default 'Upcoming',
  description text,
  created_at  timestamptz default now()
);

-- EVENT REGISTRATIONS
create table if not exists event_registrations (
  id            bigint primary key default extract(epoch from now())::bigint,
  event_id      bigint references events(id) on delete cascade,
  name          text not null,
  email         text not null,
  phone         text,
  organization  text,
  status        text default 'Registered',
  registered_at timestamptz default now()
);

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────────────────────
alter table events              enable row level security;
alter table event_registrations enable row level security;

-- Admins have full access to events
drop policy if exists "admin_only"    on events;
drop policy if exists "public_read"   on events;
drop policy if exists "admin_only"    on event_registrations;
drop policy if exists "public_register" on event_registrations;

create policy "admin_only" on events for all to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- Anyone can read events (needed by the public registration page)
create policy "public_read" on events for select to anon using (true);

-- Admins can manage all registrations
create policy "admin_only" on event_registrations for all to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- Anyone can submit a registration (public form)
create policy "public_register" on event_registrations for insert to anon
  with check (true);

-- ─── REALTIME ────────────────────────────────────────────────────────────────
alter publication supabase_realtime add table events;
alter publication supabase_realtime add table event_registrations;
