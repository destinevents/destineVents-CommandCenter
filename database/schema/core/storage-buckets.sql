-- STORAGE BUCKETS — run in Supabase → SQL Editor
-- Creates all three buckets required by the Command Center.
-- All buckets are private; authenticated users only.

insert into storage.buckets (id, name, public)
values
  ('documents',         'documents',         false),
  ('signed-agreements', 'signed-agreements', false),
  ('avatars',           'avatars',           false)
on conflict (id) do nothing;

-- Drop any old loose policies before recreating
drop policy if exists "auth_storage"       on storage.objects;
drop policy if exists "auth_docs"          on storage.objects;
drop policy if exists "auth_agreements"    on storage.objects;
drop policy if exists "auth_avatars"       on storage.objects;

-- documents bucket — admin only
create policy "auth_docs" on storage.objects
  for all to authenticated
  using  (bucket_id = 'documents' and public.current_user_role() = 'admin')
  with check (bucket_id = 'documents' and public.current_user_role() = 'admin');

-- signed-agreements bucket — admin only
create policy "auth_agreements" on storage.objects
  for all to authenticated
  using  (bucket_id = 'signed-agreements' and public.current_user_role() = 'admin')
  with check (bucket_id = 'signed-agreements' and public.current_user_role() = 'admin');

-- avatars bucket — any authenticated user can manage their own
create policy "auth_avatars" on storage.objects
  for all to authenticated
  using  (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
