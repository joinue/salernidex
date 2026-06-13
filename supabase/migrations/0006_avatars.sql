-- ============================================================
-- 0006_avatars — optional avatar image for people, orgs & groups
-- ============================================================
-- Adds an `avatar_url` text column to people, organizations, and groups, and a
-- private Storage bucket `avatars` to hold the image bytes. The column stores
-- the bucket-relative OBJECT PATH (e.g. '<household_id>/people/<uuid>.jpg'), not
-- a public URL — the app resolves it to a short-lived signed URL at render time
-- (src/lib/avatarStorage.js). null = no photo, fall back to the monogram avatar.
--
-- The bucket is PRIVATE and RLS-scoped by household: an object's first path
-- segment is the household id, and a member may read/write only their own
-- household's objects. This mirrors the privacy model on the data tables — an
-- avatar for a "Private — only me" person is never world-readable.
--
-- Run ONCE against the live project, AFTER schema.sql + 0001_multitenancy.sql.
-- Also reflected in schema.sql now (fresh installs get the columns), so this is
-- only for older projects. Safe to re-run.

begin;

-- ------------------------------------------------------------
-- 1. avatar_url column on the three entity tables
-- ------------------------------------------------------------
alter table public.people add column if not exists avatar_url text;
alter table public.organizations add column if not exists avatar_url text;
alter table public.groups add column if not exists avatar_url text;

-- ------------------------------------------------------------
-- 2. private `avatars` Storage bucket
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ------------------------------------------------------------
-- 3. RLS on storage.objects, scoped by household via the path prefix.
--    Object path = '<household_id>/<kind>/<uuid>.<ext>', so
--    (storage.foldername(name))[1] is the household id. is_member() is the same
--    SECURITY DEFINER membership test the data-table policies use.
-- ------------------------------------------------------------
drop policy if exists "avatars household read" on storage.objects;
create policy "avatars household read" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and public.is_member(((storage.foldername(name))[1])::uuid));

drop policy if exists "avatars household insert" on storage.objects;
create policy "avatars household insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and public.is_member(((storage.foldername(name))[1])::uuid));

drop policy if exists "avatars household update" on storage.objects;
create policy "avatars household update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and public.is_member(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'avatars' and public.is_member(((storage.foldername(name))[1])::uuid));

drop policy if exists "avatars household delete" on storage.objects;
create policy "avatars household delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and public.is_member(((storage.foldername(name))[1])::uuid));

commit;
