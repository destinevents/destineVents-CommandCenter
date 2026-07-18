-- RECEIPTS STORAGE BUCKET — run in Supabase → SQL Editor
-- Adds the receipts bucket for expense/payable receipt file uploads.

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

drop policy if exists "auth_receipts_insert" on storage.objects;
drop policy if exists "auth_receipts_select" on storage.objects;
drop policy if exists "auth_receipts_delete" on storage.objects;
drop policy if exists "auth_receipts" on storage.objects;

-- Authenticated users can upload their own files
create policy "auth_receipts_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'receipts');

-- Authenticated users can read any receipt (internal tool — all staff can view)
create policy "auth_receipts_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'receipts');

-- Only the uploader can delete their own receipts
create policy "auth_receipts_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'receipts' and owner = auth.uid());
