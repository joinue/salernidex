-- ============================================================
-- 0023_privacy_rename — generic 'private' privacy level (was 'marc_only')
-- ============================================================
-- The "Private — only me" enum value was historically named 'marc_only', from
-- when this was a single-person app — confusing for any household member who
-- isn't Marc. Rename it to a generic 'private'.
--
-- RENAME VALUE keeps the same underlying enum member, so every existing row
-- flips label automatically (people/organizations/tasks/lists.privacy_level AND
-- member_preferences.default_*_privacy) — no data backfill.
--
-- The four privacy-aware RLS policies (from 0001) matched the old label, so they
-- are recreated against 'private'. Behaviour is unchanged. The app reads the
-- value through lib/privacy.js (PRIVATE_LEVEL) and backups restore older
-- 'marc_only' rows as 'private' (useData.restoreBackup). Idempotent.

begin;

-- Rename only if the old label is still present, so re-runs are safe.
do $$
begin
  if exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'privacy_level' and e.enumlabel = 'marc_only'
  ) then
    alter type privacy_level rename value 'marc_only' to 'private';
  end if;
end$$;

-- Recreate the privacy-aware policies to reference the new label (same shape as
-- 0001: household members see a row unless it's private to someone else).
drop policy if exists "household members" on public.people;
create policy "household members" on public.people for all to authenticated
  using (public.is_member(household_id) and (privacy_level <> 'private' or created_by = auth.uid()))
  with check (public.is_member(household_id));

drop policy if exists "household members" on public.organizations;
create policy "household members" on public.organizations for all to authenticated
  using (public.is_member(household_id) and (privacy_level <> 'private' or created_by = auth.uid()))
  with check (public.is_member(household_id));

drop policy if exists "household members" on public.tasks;
create policy "household members" on public.tasks for all to authenticated
  using (public.is_member(household_id) and (privacy_level <> 'private' or created_by = auth.uid()))
  with check (public.is_member(household_id));

drop policy if exists "household members" on public.lists;
create policy "household members" on public.lists for all to authenticated
  using (public.is_member(household_id) and (privacy_level <> 'private' or created_by = auth.uid()))
  with check (public.is_member(household_id));

commit;
