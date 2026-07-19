-- meetings table: CRM meeting pipeline (Discovery → Strategy & Proposal → Kickoff)
create table if not exists meetings (
  id                  bigint primary key default extract(epoch from now())::bigint,
  client_id           bigint references clients(id) on delete set null,
  stage               text not null default 'Discovery',
  status              text not null default 'Not Scheduled',
  title               text,
  start_datetime      timestamptz,
  end_datetime        timestamptz,
  meeting_notes       text,
  google_meet_link    text,
  calendar_event_link text,
  google_event_id     text,
  recording_link      text,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

alter table meetings enable row level security;

drop policy if exists "meetings_admin" on meetings;
create policy "meetings_admin" on meetings for all to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

alter publication supabase_realtime add table meetings;
