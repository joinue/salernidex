-- ============================================================
-- 0033_affiliations — a person can belong to more than one organization
-- ============================================================
-- people.organization_id (0008) modeled the org as an ATTRIBUTE of a person:
-- exactly one, and `role` sat on the person rather than on the pairing, so it
-- could never answer "what are they at *which* org". Every other relation in
-- this schema is already many-to-many with a role or type on the link row
-- (task_links, relationships, groups.member_ids); the org attachment was the
-- only single FK, and it broke the moment someone sat on a board, contracted
-- for two firms, or changed jobs.
--
-- affiliations is that link row. It carries:
--   role            — their title AT THIS ORG (moved off people.role)
--   is_primary      — which one represents them when only one can be shown
--   show_in_summary — null = infer from the org's type (lib/orgs.js
--                     isCounterparty: a Contractor/Healthcare/Utility org is
--                     how you know them, so it belongs under their name; a
--                     Company is biography, so it doesn't). true/false is an
--                     explicit per-affiliation override for the exceptions.
--   started_on / ended_on — an ended affiliation is history, not a label
--
-- unique (person_id, organization_id): one link per pair. Two separate stints
-- at the same employer collapse into one row — deliberate, it keeps the member
-- lists and the summary line unambiguous.
--
-- people.role is KEPT, with a narrowed meaning: the standalone descriptor for
-- someone with no affiliation at all ("Babysitter"). The backfill moves it onto
-- the affiliation for anyone who had an org, then clears it, so no contact ends
-- up with the same title in two places. PersonForm only offers the person-level
-- field when there are no affiliations.
--
-- people.organization_id is DROPPED at the end — leaving it would be a second
-- source of truth for the same fact. Run this together with the app release
-- that reads affiliations.
--
-- Fresh installs get the same table from schema.sql; this is for projects
-- provisioned earlier. Idempotent — safe to re-run.

begin;

create table if not exists public.affiliations (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.households(id) on delete cascade,
  person_id       uuid not null references public.people(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role            text,                      -- title at this org; null = just "they're here"
  is_primary      boolean not null default false,
  show_in_summary boolean,                   -- null = infer from organizations.type
  started_on      date,
  ended_on        date,                       -- non-null = former; kept, not deleted
  created_by      uuid default auth.uid(),
  updated_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint affiliations_unique unique (person_id, organization_id),
  constraint affiliations_dates_chk check (ended_on is null or started_on is null or ended_on >= started_on)
);
create index if not exists affiliations_household_idx on public.affiliations (household_id);
create index if not exists affiliations_person_idx on public.affiliations (person_id);
create index if not exists affiliations_org_idx on public.affiliations (organization_id);

-- touch updated_at on write
drop trigger if exists affiliations_touch on public.affiliations;
create trigger affiliations_touch before update on public.affiliations
  for each row execute function public.touch_updated_at();

-- audit
drop trigger if exists affiliations_audit on public.affiliations;
create trigger affiliations_audit after insert or update or delete on public.affiliations
  for each row execute function public.write_audit();

-- RLS: household isolation (same pattern as every other data table)
alter table public.affiliations enable row level security;

drop policy if exists "household members" on public.affiliations;
create policy "household members" on public.affiliations for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

-- realtime: add to the publication if not already a member (guarded, like 0029)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'affiliations'
  ) then
    alter publication supabase_realtime add table public.affiliations;
  end if;
end $$;

-- ------------------------------------------------------------
-- Backfill: every existing people.organization_id becomes a primary
-- affiliation carrying that person's role. Guarded on the column still
-- existing so a re-run (or a fresh install from schema.sql) is a no-op.
-- ------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'people' and column_name = 'organization_id'
  ) then
    insert into public.affiliations
      (household_id, person_id, organization_id, role, is_primary, created_by)
    select p.household_id, p.id, p.organization_id,
           nullif(btrim(coalesce(p.role, '')), ''), true, p.created_by
    from public.people p
    where p.organization_id is not null
    on conflict (person_id, organization_id) do nothing;

    -- The title now lives on the affiliation. Clearing it here is what makes
    -- this a move rather than a copy — two homes for one fact is the bug we're
    -- fixing. people.role survives for contacts with no org.
    update public.people p
    set role = null
    where p.organization_id is not null
      and nullif(btrim(coalesce(p.role, '')), '') is not null;

    alter table public.people drop column organization_id;
  end if;
end $$;

commit;
