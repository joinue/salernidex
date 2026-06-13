-- ============================================================
-- 0008_org_id — people reference organizations by id, not free text
-- ============================================================
-- people.organization was free text, duplicating organizations.name. That gave
-- two incompatible notions of "membership" (OrgsView matched on the string;
-- task_links match on the org id) and meant renaming an org stranded everyone
-- whose string no longer matched. This makes organizations the single source of
-- truth: people.organization_id FKs organizations(id).
--
-- Run ONCE against the live project, AFTER schema.sql + 0001_multitenancy.sql.
-- Also reflected in schema.sql now (fresh installs get the column + FK), so this
-- is only for projects provisioned before it landed. Safe to re-run.
--
-- organizations.name is unique per household (see 0001_multitenancy), so the
-- backfill find-or-create dedupes on (household_id, name) and links people only
-- to orgs in their own household. on delete set null: deleting an org un-sets
-- it on its people.

begin;

-- 1. The column + FK (idempotent).
alter table public.people add column if not exists organization_id uuid;
alter table public.people drop constraint if exists people_organization_id_fkey;
alter table public.people
  add constraint people_organization_id_fkey
  foreign key (organization_id) references public.organizations(id) on delete set null;

-- 2. Find-or-create an organizations row for every distinct non-empty
--    people.organization string, scoped to that person's household, then point
--    organization_id at it. Skipped automatically if the legacy column is gone.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'people' and column_name = 'organization'
  ) then
    -- Create any missing orgs ((household_id, name) is unique → on conflict do
    -- nothing dedupes within each household).
    insert into public.organizations (name, household_id, created_by)
    select distinct btrim(p.organization), p.household_id, p.created_by
    from public.people p
    where btrim(coalesce(p.organization, '')) <> ''
    on conflict (household_id, name) do nothing;

    -- Link people to the org by case-insensitive, trimmed name match, scoped to
    -- the person's own household.
    update public.people p
    set organization_id = o.id
    from public.organizations o
    where p.household_id = o.household_id
      and lower(btrim(p.organization)) = lower(btrim(o.name))
      and btrim(coalesce(p.organization, '')) <> '';

    alter table public.people drop column organization;
  end if;
end $$;

commit;
