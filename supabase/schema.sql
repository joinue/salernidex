-- ============================================================
-- SALERNIDEX — Supabase schema (BASE)
-- ============================================================
-- This is the base schema: run it FIRST in the Supabase SQL Editor
-- (Dashboard -> SQL Editor), top to bottom. It stands up every table plus an
-- initial "single shared account" RLS model (open access, app-side privacy).
--
-- To reach the CURRENT production shape, then apply the migrations in
-- supabase/migrations IN ORDER (0001 → 0008). That is the exact sequence the
-- live project was built with. The big jump is 0001_multitenancy, which adds
-- household_id to every table and swaps the open policies below for
-- household-scoped, privacy-aware ones — so the base file alone is NOT a
-- complete or isolated install. (Sections further down that read like "to do
-- at go-live" describe what those migrations apply; see the per-section notes.)
-- ============================================================

-- gen_random_bytes (households.join_code) lives in pgcrypto. Usually enabled
-- on Supabase, but don't bet a migration on "usually".
create extension if not exists pgcrypto with schema extensions;

-- Privacy enum. NOTE: 'marc_only' is the legacy "Private — only me" label kept
-- here so the historical 0001 policies still apply on a fresh install; migration
-- 0023 renames it to the generic 'private' (the app uses 'private' — see
-- lib/privacy.js). Leave this base value as-is.
create type privacy_level as enum ('marc_only', 'shared', 'family_shared', 'public');

-- ------------------------------------------------------------
-- families (contact family units — "The Parks". A grouping of
-- *contacts*, distinct from the household/tenant model below.)
-- ------------------------------------------------------------
create table public.families (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  notes       text,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- people
-- ------------------------------------------------------------
create table public.people (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  role          text,                          -- standalone descriptor ("Babysitter") for contacts with NO affiliation; a title at an org lives on affiliations.role (0033)
  email         text,                          -- primary email; drives search + duplicate detection
  phone         text,                          -- primary phone; drives search + duplicate detection
  emails        jsonb not null default '[]',    -- additional labeled emails: [{label, value}] (see 0012)
  phones        jsonb not null default '[]',    -- additional labeled phones: [{label, value}] (see 0012)
  socials       jsonb not null default '[]',    -- social profiles: [{platform, value}] (see 0012)
  birthday      date,
  address       text,
  latitude      double precision,              -- geocoded from `address` (see 0027); null = not yet/failed
  longitude     double precision,
  geocoded_address text,                       -- the `address` string these coords were resolved from; re-geocode when it differs
  tags          text[] not null default '{}',
  tier          text check (tier in ('family', 'inner', 'close', 'network', 'acquaintance')),  -- relationship tier; null = unsorted. Order (closest→loosest) drives TIER_RANK in lib/constants.js
  family_id     uuid references public.families(id) on delete set null,
  privacy_level privacy_level not null default 'shared',
  notes         text,
  avatar_url    text,                          -- avatars Storage object path (see 0006); null = monogram fallback
  keep_in_touch_days integer check (keep_in_touch_days is null or keep_in_touch_days >= 0),  -- cadence in days; null/0 = off
  deleted_at    timestamptz,                -- soft delete: null = active
  created_by    uuid default auth.uid(),
  updated_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ------------------------------------------------------------
-- key_dates (dates that matter beyond birthday — anniversaries,
-- memorials, "started new job". Annual by default; one-offs allowed.)
-- ------------------------------------------------------------
create table public.key_dates (
  id          uuid primary key default gen_random_uuid(),
  person_id   uuid not null references public.people(id) on delete cascade,
  label       text not null,                -- e.g. 'Wedding anniversary'
  date        date not null,                -- original date; its year drives "N years"
  annual      boolean not null default true, -- repeats yearly vs one-off
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- organizations
-- ------------------------------------------------------------
create table public.organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  type          text,                       -- see ORG_TYPES in lib/orgs.js; also classifies the org as counterparty vs biography
  description   text,
  -- Contact details (0032). An org is a contactable record in its own right —
  -- a contractor or doctor's office needs no person attached to be complete.
  phone         text,
  email         text,
  website       text,
  address       text,
  key_contacts  text[] not null default '{}',
  tags          text[] not null default '{}',
  privacy_level privacy_level not null default 'shared',
  avatar_url    text,                          -- avatars Storage object path (see 0006); null = monogram fallback
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- people ↔ organizations is many-to-many via public.affiliations (0033), which
-- is defined further down with the other post-multitenancy tables (it carries
-- household_id from birth). It replaced the old people.organization_id FK.

-- ------------------------------------------------------------
-- relationships
-- ------------------------------------------------------------
create table public.relationships (
  id                uuid primary key default gen_random_uuid(),
  person_a_id       uuid not null references public.people(id) on delete cascade,
  person_b_id       uuid not null references public.people(id) on delete cascade,
  relationship_type text not null default 'knows',  -- knows, works_with, connected_to, reports_to
  notes             text,
  created_by        uuid default auth.uid(),
  created_at        timestamptz not null default now(),
  constraint no_self_relationship check (person_a_id <> person_b_id)
);

-- ------------------------------------------------------------
-- interactions (touchpoint log: the CRM activity history)
-- ------------------------------------------------------------
create table public.interactions (
  id           uuid primary key default gen_random_uuid(),
  person_id    uuid not null references public.people(id) on delete cascade,
  type         text not null default 'note',   -- call, text, meeting, email, note
  occurred_at  timestamptz not null default now(),
  note         text,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now()
);

-- ------------------------------------------------------------
-- groups (two modes: 'smart' = tag logic AND/OR/NOT, 'manual' = hand-picked)
-- ------------------------------------------------------------
create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  kind        text not null default 'smart' check (kind in ('smart', 'manual')),
  member_ids  uuid[] not null default '{}',   -- manual groups: the exact members (ids of people)
  all_tags    text[] not null default '{}',   -- smart: person must have ALL of these
  any_tags    text[] not null default '{}',   -- ...and at least ONE of these (if any listed)
  none_tags   text[] not null default '{}',   -- ...and NONE of these
  avatar_url  text,                            -- avatars Storage object path (see 0006); null = monogram fallback
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- tasks (one object covers to-dos, recurring chores, and projects)
--   - recurring chore: recurrence jsonb set (RRULE-lite; rolls forward
--     on completion — see lib/recurrence.js)
--   - project: a task with subtasks (children via parent_id) and/or
--     is_project = true; projects get the richer ProjectDetail page and can
--     have people/orgs attached via task_links (e.g. a contractor)
--   - assignee: a household_member id or 'anyone' (legacy demo labels
--     'either|me|partner' are mapped on read; becomes a uuid FK at the
--     multitenancy migration below)
-- ------------------------------------------------------------
create table public.tasks (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  notes         text,
  assignee      text not null default 'anyone',     -- member id | 'anyone'
  area          text,                                -- optional user-defined category ("Work", "Personal"); null = none (TasksView group-by)
  tags          text[] not null default '{}',        -- cross-cutting labels, same shape as people.tags (0022); area is the one category, tags are the many
  due_date      date,
  due_kind      text not null default 'on'           -- what the due date MEANS (0034): 'on' = belongs to that day (recurring occurrence, appointment) · 'by' = a deadline, actionable now, buckets under Anytime and reaches Today a week out. Ignored when due_date is null
    check (due_kind in ('on', 'by')),
  start_date    date,                                -- optional defer date (0021); until it arrives the task is hidden from Today + the sender and buckets under Upcoming. null = not deferred
  end_date      date,                                -- optional project target finish (0028); pairs with start_date so a project can span a range (trip depart→return). Ignored on plain tasks
  due_time      time,                                -- optional local time-of-day; null = all-day (0013). Only meaningful with due_date; survives recurrence roll-forward
  priority      smallint not null default 0 check (priority between 0 and 3),  -- 0 none · 1 low · 2 med · 3 high (0014); flag + tiebreaker, not the Tasks-page order
  recurrence    jsonb,                              -- null = one-off; RRULE-lite (see lib/recurrence.js). Optional keys: until ('YYYY-MM-DD' end date, inclusive) and exdates (['YYYY-MM-DD'] skipped occurrences)
  parent_id     uuid references public.tasks(id) on delete cascade,  -- subtask of a project
  constraint no_self_parent check (parent_id <> id),
  is_project    boolean not null default false,     -- explicit project flag (only an is_project task gets the full-page ProjectDetail + Projects index)
  project_status text not null default 'active'      -- project lifecycle (0028): 'active' | 'someday'. 'done' is NOT stored here — done = completed_at is not null. Ignored on plain tasks
    check (project_status in ('active', 'someday')),
  is_heading    boolean not null default false,     -- Things-style section row inside a project; groups the subtasks that follow it in manual order
  sort_order    double precision,                   -- manual drag order (fractional ranks, lib/order.js); null = never placed, sorts after ranked rows by created_at
  privacy_level privacy_level not null default 'shared',
  completed_at  timestamptz,                         -- null = open
  created_by    uuid default auth.uid(),
  updated_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ------------------------------------------------------------
-- task_completions (history of when a task was checked off + by whom)
--   - recurring chores roll forward instead of closing, so this is the only
--     record that a given cycle was actually done (accountability for couples)
-- ------------------------------------------------------------
create table public.task_completions (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.tasks(id) on delete cascade,
  completed_at timestamptz not null default now(),
  completed_by text,                              -- member id | null (unknown)
  created_at   timestamptz not null default now()
);

-- ------------------------------------------------------------
-- task_links (attach people / organizations to a task or project)
--   - the bridge between the rolodex and the to-do side of the app, e.g. a
--     "Kitchen remodel" project linked to the contractor's org + the GC's
--     contact. This is the integration a generic todo app can't do.
--   - polymorphic: entity_type picks the table, entity_id the row. No FK on
--     entity_id because it spans two tables; the UI filters links whose
--     target no longer exists (orgs hard-delete, people soft-delete).
-- ------------------------------------------------------------
create table public.task_links (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  entity_type text not null,                       -- person | organization | group
  entity_id   uuid not null,
  role        text,                                -- optional, e.g. 'plumber', 'contractor'
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  constraint task_links_entity_type_chk check (entity_type in ('person', 'organization', 'group')),
  constraint task_links_unique unique (task_id, entity_type, entity_id)
);

-- ------------------------------------------------------------
-- lists + list_items (shared household lists: groceries, shopping, custom)
-- ------------------------------------------------------------
create table public.lists (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  icon          text,                               -- emoji, e.g. 🛒
  color         text,                               -- optional accent tint for the emoji tile (0031)
  kind          text not null default 'standard'    -- 'standard' | 'grocery' (aisle-grouped, 0019) | 'meal_plan' (day-indexed, 0037) | 'collection' (no check-off, 0038); behaviour table in src/lib/listKinds.js
    check (kind in ('standard', 'grocery', 'meal_plan', 'collection')),
  privacy_level privacy_level not null default 'family_shared',
  due_date         date,                            -- optional "get it by" date; surfaces on Today (0016)
  reminder_time    time,                            -- local HH:MM nudge; null = none (0016)
  reminder_enabled boolean not null default false,  -- (0016)
  project_id       uuid references public.tasks(id) on delete set null,  -- optional home project (0028); the list still appears in global Lists. On delete: keep the list, just unscope it
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.list_items (
  id          uuid primary key default gen_random_uuid(),
  list_id     uuid not null references public.lists(id) on delete cascade,
  text        text not null,
  note        text,                                 -- optional detail line ("the oat one") (0015)
  qty         text,                                 -- structured quantity ("2", "2 lbs", "a dozen") (0023)
  category    text,                                 -- grocery aisle ("Produce"…); null = "Other" (0019)
  is_heading  boolean not null default false,       -- standard-list section row, à la tasks.is_heading (0019)
  on_date     date,                                 -- meal-plan day this item belongs to; null = unscheduled / not a meal plan (0037)
  checked_at  timestamptz,                          -- null = not yet got/done
  sort_order  double precision,                     -- manual drag order (see tasks.sort_order)
  assignee    uuid,                                 -- household_members FK; who's grabbing it, null = anyone (0023)
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- audit_log
-- ------------------------------------------------------------
create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid,
  action      text not null,                -- created, updated, deleted
  table_name  text not null,
  record_id   uuid,
  changes     jsonb,
  "timestamp" timestamptz not null default now()
);

-- ------------------------------------------------------------
-- updated_at maintenance
-- ------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  if to_jsonb(new) ? 'updated_by' then
    new.updated_by = auth.uid();
  end if;
  return new;
end $$;

create trigger families_touch before update on public.families
  for each row execute function public.touch_updated_at();
create trigger people_touch before update on public.people
  for each row execute function public.touch_updated_at();
create trigger organizations_touch before update on public.organizations
  for each row execute function public.touch_updated_at();
create trigger groups_touch before update on public.groups
  for each row execute function public.touch_updated_at();
create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();
create trigger lists_touch before update on public.lists
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------
-- audit trigger
-- ------------------------------------------------------------
-- security definer (writes bypass audit_log's read-only RLS); search_path is
-- pinned, as it must be on every definer function.
create or replace function public.write_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (user_id, action, table_name, record_id, changes)
  values (
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    coalesce(new.id, old.id),
    case tg_op
      when 'INSERT' then to_jsonb(new)
      when 'UPDATE' then jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new))
      when 'DELETE' then to_jsonb(old)
    end
  );
  return coalesce(new, old);
end $$;

create trigger people_audit after insert or update or delete on public.people
  for each row execute function public.write_audit();
create trigger families_audit after insert or update or delete on public.families
  for each row execute function public.write_audit();
create trigger key_dates_audit after insert or update or delete on public.key_dates
  for each row execute function public.write_audit();
create trigger interactions_audit after insert or update or delete on public.interactions
  for each row execute function public.write_audit();
create trigger organizations_audit after insert or update or delete on public.organizations
  for each row execute function public.write_audit();
create trigger relationships_audit after insert or update or delete on public.relationships
  for each row execute function public.write_audit();
create trigger groups_audit after insert or update or delete on public.groups
  for each row execute function public.write_audit();
create trigger tasks_audit after insert or update or delete on public.tasks
  for each row execute function public.write_audit();
create trigger task_links_audit after insert or update or delete on public.task_links
  for each row execute function public.write_audit();

-- ------------------------------------------------------------
-- Row Level Security — BASE (open) policies
-- Initial "single shared account" model: any authenticated user has full
-- access, and privacy_level filtering happens in the app UI.
--
-- NOTE: 0001_multitenancy DROPS every "authenticated full access" policy below
-- and replaces it with a household-scoped "household members" policy (and, on
-- the privacy_level tables, enforces "Private — only me" at the DB too). After
-- that migration these open policies no longer exist — they're the pre-tenancy
-- starting point, kept here so the base file runs cleanly on its own.
-- ------------------------------------------------------------
alter table public.families enable row level security;
alter table public.people enable row level security;
alter table public.key_dates enable row level security;
alter table public.organizations enable row level security;
alter table public.relationships enable row level security;
alter table public.interactions enable row level security;
alter table public.groups enable row level security;
alter table public.tasks enable row level security;
alter table public.task_completions enable row level security;
alter table public.task_links enable row level security;
alter table public.lists enable row level security;
alter table public.list_items enable row level security;
alter table public.audit_log enable row level security;

create policy "authenticated full access" on public.people
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.families
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.key_dates
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.interactions
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.tasks
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.task_completions
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.task_links
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.lists
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.list_items
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.organizations
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.relationships
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.groups
  for all to authenticated using (true) with check (true);
-- audit_log: NO client policies on purpose. The log captures full row
-- contents; no app surface reads it, and post-multitenancy a blanket read
-- policy would leak other households' data through the change history.
-- RLS enabled + zero policies = service-role/support access only.

-- ------------------------------------------------------------
-- Helpful indexes for search
-- ------------------------------------------------------------
create index people_name_idx on public.people using gin (to_tsvector('simple', name));
create index people_tags_idx on public.people using gin (tags);
create index people_family_idx on public.people (family_id);
create index key_dates_person_idx on public.key_dates (person_id);
create index relationships_a_idx on public.relationships (person_a_id);
create index relationships_b_idx on public.relationships (person_b_id);

-- One row per pair+type regardless of direction (A knows B == B knows A).
create unique index relationships_pair_idx on public.relationships
  (least(person_a_id, person_b_id), greatest(person_a_id, person_b_id), relationship_type);
create index interactions_person_idx on public.interactions (person_id, occurred_at desc);
create index tasks_due_idx on public.tasks (due_date) where completed_at is null;
create index tasks_parent_idx on public.tasks (parent_id);
create index task_completions_task_idx on public.task_completions (task_id, completed_at desc);
create index task_links_task_idx on public.task_links (task_id);
create index list_items_list_idx on public.list_items (list_id, created_at);
-- Meal-plan reads are one list over a rolling date window (0037).
create index list_items_on_date_idx on public.list_items (list_id, on_date) where on_date is not null;
create index lists_due_idx on public.lists (due_date) where due_date is not null;
create index lists_project_idx on public.lists (project_id) where project_id is not null;

-- ------------------------------------------------------------
-- Realtime (so edits sync live across devices)
-- ------------------------------------------------------------
alter publication supabase_realtime add table public.people;
alter publication supabase_realtime add table public.families;
alter publication supabase_realtime add table public.key_dates;
alter publication supabase_realtime add table public.organizations;
alter publication supabase_realtime add table public.relationships;
alter publication supabase_realtime add table public.interactions;
alter publication supabase_realtime add table public.groups;
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.task_completions;
alter publication supabase_realtime add table public.task_links;
alter publication supabase_realtime add table public.lists;
alter publication supabase_realtime add table public.list_items;

-- ============================================================
-- MULTITENANCY — tenancy tables (LIVE)
-- ------------------------------------------------------------
-- Moves the app from "one shared account sees everything" to per-user accounts
-- that belong to one or more households, with row isolation by household.
--
-- The households / household_members tables, their RLS, and the
-- create_household() / join_household() RPCs below are CREATED BY THIS FILE and
-- are live. What this file does NOT do is scope the *data* tables to a
-- household — that half (household_id columns + the swap from the open policies
-- above to household-scoped ones + the assignee→member_id conversion) is
-- applied by 0001_multitenancy.sql. The commented "EVERY data table gets
-- household_id …" block lower in this section documents exactly what 0001 does.
--
-- Generalizes beyond couples: a household has N members (couple, family,
-- roommates). Assignee/“who did it” reference a household_member, not a label.
-- ============================================================

-- A tenant. join_code lets someone join via a shareable code/link.
-- 6 random bytes (12 hex chars): join_household() is an open RPC, so the
-- code IS the credential — keep it unguessable, and regenerate after each
-- successful join (the app already offers regeneration).
create table public.households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'Our Household',
  join_code   text not null unique default encode(gen_random_bytes(6), 'hex'),
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);

-- Who belongs to a household. One auth user can be in several households
-- (switch between them). Leaving = delete this row. display_name shows even
-- before a member fills out a profile.
create table public.household_members (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  display_name  text not null default '',
  role          text not null default 'member' check (role in ('owner', 'member')),
  person_id     uuid references public.people(id) on delete set null,  -- this member's self contact card; its photo is the member's avatar (0025)
  timezone      text not null default 'America/Phoenix'                -- IANA zone deciding this member's "today"/"now" for reminders (0036)
    check (timezone ~ '^[A-Za-z][A-Za-z0-9+_/-]*$'),
  joined_at     timestamptz not null default now(),
  unique (household_id, user_id)
);

-- "my memberships" lookups (the unique above only serves household-first)
create index household_members_user_idx on public.household_members (user_id);

-- Membership tests, used by RLS policies. SECURITY DEFINER is what breaks
-- the recursion: policies on household_members can't subquery
-- household_members directly (infinite RLS recursion), but a definer
-- function reads it as the owner, bypassing RLS. search_path pinned.
create or replace function public.is_member(hid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_owner(hid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = auth.uid() and m.role = 'owner'
  );
$$;

-- RLS for the tenancy tables themselves. Without this, ANY signed-in user
-- could read every household's join_code and membership list.
alter table public.households enable row level security;
alter table public.household_members enable row level security;

-- households: members only. No insert/delete policy — creation goes through
-- create_household() below (a bare insert would strand the creator: they
-- aren't a member yet, so they couldn't even select the row back); deleting
-- a household is a service-role/support operation.
create policy "members read" on public.households
  for select to authenticated using (public.is_member(id));
create policy "members update" on public.households
  for update to authenticated using (public.is_member(id)) with check (public.is_member(id));

-- household_members: co-members see each other; you can rename yourself or
-- leave; owners can rename/remove anyone in their household. Joining goes
-- through join_household() below.
create policy "co-members read" on public.household_members
  for select to authenticated using (public.is_member(household_id));
create policy "self or owner update" on public.household_members
  for update to authenticated
  using (user_id = auth.uid() or public.is_owner(household_id))
  with check (public.is_member(household_id));
create policy "self leave or owner remove" on public.household_members
  for delete to authenticated
  using (user_id = auth.uid() or public.is_owner(household_id));

-- Create a household and its owner membership atomically (RLS-safe).
create or replace function public.create_household(household_name text default 'Our Household', member_name text default '')
returns public.household_members language plpgsql security definer set search_path = public as $$
declare h public.households; m public.household_members; pid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  insert into public.households (name, created_by)
  values (coalesce(nullif(household_name, ''), 'Our Household'), auth.uid())
  returning * into h;
  insert into public.household_members (household_id, user_id, display_name, role)
  values (h.id, auth.uid(), coalesce(member_name, ''), 'owner')
  returning * into m;
  -- Self contact card (see 0025): named from the display name ('Me' only as a
  -- last resort so the card always has a name); 'shared' so co-members see it
  -- and its photo becomes this member's avatar.
  insert into public.people (household_id, name, created_by, privacy_level)
  values (h.id, coalesce(nullif(member_name, ''), 'Me'), auth.uid(), 'shared')
  returning id into pid;
  update public.household_members set person_id = pid where id = m.id returning * into m;
  return m;
end $$;

-- The join/create RPCs are the front door — signed-in users only.
revoke execute on function public.create_household(text, text) from anon;

-- APPLIED BY 0001_multitenancy.sql (documented here, not run by this file):
-- every data table gets `household_id uuid not null references households(id)`
-- and is scoped by it. (people, organizations, relationships, interactions,
-- groups, tasks, task_completions, task_links, lists, list_items.) Example:
--
--   alter table public.people add column household_id uuid
--     not null references public.households(id) on delete cascade;
--   create index people_household_idx on public.people (household_id);
--
--   alter table public.people enable row level security;
--   drop policy if exists "authenticated full access" on public.people;
--   create policy "household members" on public.people for all to authenticated
--     using (public.is_member(household_id)
--            and (privacy_level <> 'private' or created_by = auth.uid()))  -- 'marc_only' before 0023
--     with check (public.is_member(household_id));
--
-- Repeat for all data tables. The privacy clause (on tables that have
-- privacy_level: people, organizations, tasks, lists) makes "Private — only
-- me" rows invisible to other household members AT THE DATABASE — the app
-- enforces the same rule client-side today (lib/privacy.js). Two extra catches when threading household_id:
--   - organizations.name is GLOBALLY unique above; two households will both
--     have "Pima County". Replace it:
--       alter table public.organizations drop constraint organizations_name_key;
--       alter table public.organizations add unique (household_id, name);
--   - demo data restored from a JSON backup carries localStorage member ids
--     ('m-1', 'm-2') in tasks.assignee, task_completions.completed_by, and
--     reminder_snoozes.member_id — map them to the real household_members
--     uuids during the restore, BEFORE the column conversions below.

-- Also applied by 0001: assignee / completed_by become household_member
-- references instead of the label text used in the demo (USING must cast —
-- bare `using null` is a syntax error):
--   alter table public.tasks
--     alter column assignee drop default,
--     alter column assignee type uuid using nullif(assignee, 'anyone')::uuid,  -- null = "anyone"
--     add constraint tasks_assignee_fk
--       foreign key (assignee) references public.household_members(id) on delete set null;
--   alter table public.task_completions
--     alter column completed_by type uuid using completed_by::uuid,
--     add constraint completions_by_fk
--       foreign key (completed_by) references public.household_members(id) on delete set null;

-- Join a household by code (run as the signed-in user). Returns the membership.
-- Code matching is normalized — uppercase, letters+digits only — so a code
-- that's typed (phones auto-capitalize), pasted, or written with/without the
-- display hyphen all resolve to the same household. The client normalizes the
-- same way (src/lib/joinCode.js).
create or replace function public.join_household(code text, name text default '')
returns public.household_members language plpgsql security definer set search_path = public as $$
declare h public.households; m public.household_members; pid uuid;
begin
  select * into h from public.households
   where upper(regexp_replace(join_code, '[^a-zA-Z0-9]', '', 'g'))
       = upper(regexp_replace(code,      '[^a-zA-Z0-9]', '', 'g'));
  if not found then raise exception 'Invalid join code'; end if;
  insert into public.household_members (household_id, user_id, display_name)
  values (h.id, auth.uid(), coalesce(nullif(name,''), ''))
  on conflict (household_id, user_id) do update set display_name = excluded.display_name
  returning * into m;
  -- First-time joiners get a self card (see 0025); a re-join keeps theirs
  -- (person_id already set), so we never duplicate.
  if m.person_id is null then
    insert into public.people (household_id, name, created_by, privacy_level)
    values (h.id, coalesce(nullif(name,''), 'Me'), auth.uid(), 'shared')
    returning id into pid;
    update public.household_members set person_id = pid where id = m.id returning * into m;
  end if;
  return m;
end $$;

revoke execute on function public.join_household(text, text) from anon;

-- Owner succession (added by 0020). After a member is removed, if the household
-- still exists (not a cascade from deleting the household itself) and now has
-- members but no owner, promote the longest-standing one — so the last owner
-- leaving never strands the remaining members without anyone who can manage them.
create or replace function public.promote_owner_on_leave()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.households where id = old.household_id) then
    return old;  -- household gone already → cascade delete; nothing to promote
  end if;
  if not exists (
    select 1 from public.household_members
     where household_id = old.household_id and role = 'owner'
  ) then
    update public.household_members
       set role = 'owner'
     where id = (
       select id from public.household_members
        where household_id = old.household_id
        order by joined_at, id
        limit 1
     );
  end if;
  return old;
end $$;

drop trigger if exists household_members_promote_owner on public.household_members;
create trigger household_members_promote_owner
  after delete on public.household_members
  for each row execute function public.promote_owner_on_leave();

-- Clean delete (added by 0020). Delete a household you're the SOLE member of —
-- the honest "reset / start over". The on-delete cascades from 0001 take the
-- membership row and every data table with it, so nothing is orphaned behind RLS.
-- Guarded to one member so it can't nuke co-members' data; a multi-member
-- household is left via a normal household_members row delete instead.
create or replace function public.delete_household(hid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if not public.is_member(hid) then raise exception 'Not a member of this household'; end if;
  select count(*) into n from public.household_members where household_id = hid;
  if n > 1 then raise exception 'Household still has other members'; end if;
  delete from public.households where id = hid;
end $$;

revoke execute on function public.delete_household(uuid) from anon;

-- Member renames / joins sync live across devices (RLS filters events):
alter publication supabase_realtime add table public.households;
alter publication supabase_realtime add table public.household_members;

-- Done in 0023: the privacy_level enum value 'marc_only' was renamed to a
-- generic 'private' (RENAME VALUE), and the four privacy-aware policies were
-- recreated to match. The app reads 'private' via lib/privacy.js.
-- Still pending: consider a `profiles` table (user_id, default_household_id) to
-- remember the last-used household for the switcher across devices.


-- ============================================================
-- PHASE 6 - reminders & notifications
-- ============================================================
-- The tables, RLS, and realtime below are CREATED BY THIS FILE and are live
-- (member_preferences is also (re)created idempotently by 0002 for older
-- projects). The in-app attention layer (6a) reads them in live mode and falls
-- back to localStorage in demo. What is NOT wired is push DELIVERY (6b): the
-- pg_cron schedule + send-reminders Edge Function at the very end of this file
-- remain commented until that function is deployed. Per-member references use
-- household_members(id), so these tables assume the tenancy tables above exist.

-- Per-member snooze/dismiss state for attention items. target_key is the
-- engine's stable key (e.g. 'task:<id>', 'nudge:<person_id>',
-- 'date:b-<person_id>' / 'date:<key_date_id>'). until = null means dismissed
-- for good; otherwise hidden through that timestamp.
create table public.reminder_snoozes (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.household_members(id) on delete cascade,
  kind        text not null check (kind in ('task', 'nudge', 'date', 'fyi')),
  target_key  text not null,
  until       timestamptz,                  -- null = dismissed forever
  created_at  timestamptz not null default now(),
  unique (member_id, kind, target_key)
);

-- Per-member notification preferences (one row per member, defaults match
-- the agreed scope: everything on except partner FYIs).
create table public.notification_prefs (
  id              uuid primary key default gen_random_uuid(),
  member_id       uuid not null unique references public.household_members(id) on delete cascade,
  tasks           boolean not null default true,
  lists           boolean not null default true,  -- a list with a due date reaching today/overdue (added by 0021)
  nudges          boolean not null default true,
  dates           boolean not null default true,
  fyi             boolean not null default false,
  dates_lead_days integer not null default 7 check (dates_lead_days between 1 and 60),
  digest_time     time not null default '08:00',
  updated_at      timestamptz not null default now()
);

create trigger notification_prefs_touch before update on public.notification_prefs
  for each row execute function public.touch_updated_at();

-- Per-member app preferences: the visibility new items start with, how the
-- Tasks page opens, and the People-page sort. One row per member. Client mirror
-- is src/lib/appPrefs.js (localStorage until this is wired at go-live, same as
-- notification_prefs). Theme is deliberately NOT here — it's per-device.
-- task_filter null = "Everyone"; set to a member to default that page to them
-- (on delete set null falls back to Everyone, matching the client guard).
create table public.member_preferences (
  id                     uuid primary key default gen_random_uuid(),
  member_id              uuid not null unique references public.household_members(id) on delete cascade,
  default_task_privacy   privacy_level not null default 'shared',
  default_list_privacy   privacy_level not null default 'family_shared',
  default_person_privacy privacy_level not null default 'shared',
  task_filter            uuid references public.household_members(id) on delete set null,
  show_completed         boolean not null default false,
  people_sort            text not null default 'name' check (people_sort in ('name', 'recent', 'tier')),
  projects_sort          text not null default 'recent' check (projects_sort in ('recent', 'name', 'due')),  -- Projects-index sort (0028), mirrors people_sort
  updated_at             timestamptz not null default now()
);

create trigger member_preferences_touch before update on public.member_preferences
  for each row execute function public.touch_updated_at();

-- Web-push subscriptions, one per browser/device a member enabled push on.
-- endpoint is unique per subscription; a member can hold several (phone,
-- laptop). Stale endpoints (410 Gone on send) are deleted by the sender.
create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.household_members(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,                -- client public key
  auth        text not null,                -- client auth secret
  user_agent  text,                         -- debugging aid ("which device is this?")
  created_at  timestamptz not null default now()
);

create index push_subscriptions_member_idx on public.push_subscriptions (member_id);

-- Send-dedupe log so the scheduler never pings twice about the same item on
-- the same day (it runs every 15 min). sent_for is the local calendar date
-- the notification was about; digest entries use kind = 'digest'.
create table public.notification_log (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.household_members(id) on delete cascade,
  kind        text not null,                -- task | nudge | date | digest
  target_key  text not null default '',     -- '' for digest
  sent_for    date not null,
  sent_at     timestamptz not null default now(),
  unique (member_id, kind, target_key, sent_for)
);

-- RLS: a member manages only their own rows (their snoozes, their prefs,
-- their devices); the membership join keeps it inside the household model.
alter table public.reminder_snoozes enable row level security;
alter table public.notification_prefs enable row level security;
alter table public.member_preferences enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_log enable row level security;

create or replace function public.is_own_member(mid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.household_members m
    where m.id = mid and m.user_id = auth.uid()
  );
$$;

create policy "own rows" on public.reminder_snoozes for all to authenticated
  using (public.is_own_member(member_id)) with check (public.is_own_member(member_id));
create policy "own rows" on public.notification_prefs for all to authenticated
  using (public.is_own_member(member_id)) with check (public.is_own_member(member_id));
create policy "own rows" on public.member_preferences for all to authenticated
  using (public.is_own_member(member_id)) with check (public.is_own_member(member_id));
create policy "own rows" on public.push_subscriptions for all to authenticated
  using (public.is_own_member(member_id)) with check (public.is_own_member(member_id));
create policy "own rows read" on public.notification_log for select to authenticated
  using (public.is_own_member(member_id));
-- notification_log inserts happen via the service-role sender, not clients.

-- Snoozes sync across a member's devices live:
alter publication supabase_realtime add table public.reminder_snoozes;
alter publication supabase_realtime add table public.notification_prefs;
alter publication supabase_realtime add table public.member_preferences;

-- Scheduler (6b): pg_cron invokes the send-reminders Edge Function every
-- 15 minutes. The function recomputes the same attention rules as
-- src/lib/reminders.js server-side, applies prefs + snoozes, dedupes via
-- notification_log, and web-pushes (VAPID) to each member's subscriptions.
--
-- Scheduled and verified live on 2026-08-06 (jobid 2). This is the exact block
-- that works — an earlier sketch here was wrong in three ways, noted inline:
--
--   create extension if not exists pg_cron;
--   create extension if not exists pg_net;
--
--   -- Keep this guard. A second live job double-sends; an earlier broken job
--   -- (403s every 15 min) was found and replaced this way.
--   select cron.unschedule('send-reminders')
--   where exists (select 1 from cron.job where jobname = 'send-reminders');
--
--   select cron.schedule('send-reminders', '*/15 * * * *', $$
--     select net.http_post(
--       -- (1) needs the https:// scheme; a bare host is rejected
--       url     := 'https://<project>.supabase.co/functions/v1/send-reminders',
--       -- (2) CRON_SECRET, *not* the service-role key: under Supabase's newer
--       --     API-key system the dashboard service_role value no longer matches
--       --     SUPABASE_SERVICE_ROLE_KEY. See functions/send-reminders/auth.ts.
--       -- (3) passing headers REPLACES pg_net's default, so Content-Type must
--       --     be set explicitly here.
--       headers := jsonb_build_object(
--                    'Content-Type',  'application/json',
--                    'Authorization', 'Bearer <CRON_SECRET>'
--                  ),
--       body    := '{}'::jsonb,
--       -- 5s default is too short: the sweep loops every member.
--       timeout_milliseconds := 30000
--     );
--   $$);
--
-- Verify (net.http_post is fire-and-forget, so a successful cron run only means
-- the request was dispatched — status_code is the real signal):
--
--   select status_code, content, created from net._http_response
--   order by created desc limit 5;
--
-- Implementation: supabase/functions/send-reminders/index.ts. Function secrets
-- (set via `supabase secrets set`): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
-- VAPID_SUBJECT, TZ_NAME, and CRON_SECRET (the bearer the cron job sends; the
-- function accepts it OR the service-role key). The public key is also exposed to
-- the client as VITE_VAPID_PUBLIC_KEY for subscribe(); the private key lives ONLY
-- in function secrets — never a VITE_ var (those ship to the browser).


-- ============================================================
-- avatars Storage bucket (people / orgs / groups photos) — see 0006
-- ============================================================
-- people.avatar_url / organizations.avatar_url / groups.avatar_url hold the
-- bucket-relative object path '<household_id>/<kind>/<uuid>.<ext>'; the app
-- resolves it to a short-lived signed URL at render (src/lib/avatarStorage.js).
-- Private bucket, RLS-scoped by the household id in the first path segment so an
-- avatar is only ever visible inside the household that owns it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "avatars household read" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy "avatars household insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy "avatars household update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and public.is_member(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'avatars' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy "avatars household delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and public.is_member(((storage.foldername(name))[1])::uuid));


-- ============================================================
-- habits — personal habit tracking (see 0010)
-- ============================================================
-- Defined after the households / is_member section above because (unlike the
-- pre-multitenancy tables) habits are household-scoped from birth. Polarity
-- decides what a good day is (build/limit/track); membership = the day's logged
-- value vs target, evaluated in src/lib/habits.js. Personal to member_id.
create table public.habits (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  member_id    uuid not null references public.household_members(id) on delete cascade,
  name         text not null,
  polarity     text not null default 'build' check (polarity in ('build', 'limit', 'track')),
  measure      text not null default 'count' check (measure in ('binary', 'count')),
  unit         text,                              -- count habits: "drinks", "min", "glasses"
  target       numeric,                           -- build: floor (>=); limit: ceiling (<=); track: none
  track_streak boolean not null default true,     -- forced off for 'track' in the UI
  active_days  smallint[] not null default '{}',  -- 0=Sun..6=Sat; empty = every day
  weekly_target smallint,                          -- "N times per week, any day" (null = use active_days)
  rrule        jsonb,                              -- RRULE-lite (lib/recurrence.js): every N days/weeks, monthly, yearly. Set => overrides active_days/weekly_target
  show_on_today boolean not null default false,   -- pinned to the Today dashboard card
  reminder_time time,                              -- local HH:MM nudge; null = none
  reminder_enabled boolean not null default false,
  shared       boolean not null default false,     -- visible (read-only) to other household members
  color        text,
  icon         text,
  sort_order   double precision,
  archived_at  timestamptz,
  deleted_at   timestamptz,
  created_by   uuid default auth.uid(),
  updated_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index habits_household_idx on public.habits (household_id);
create index habits_member_idx on public.habits (member_id);

-- one logged value per habit per day; the app upserts on (habit_id, date)
create table public.habit_entries (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  habit_id     uuid not null references public.habits(id) on delete cascade,
  date         date not null,
  value        numeric not null default 0,
  skipped      boolean not null default false,    -- one-off rest day; transparent to streaks
  note         text,                              -- optional context for the day ("PR today")
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (habit_id, date)
);
create index habit_entries_household_idx on public.habit_entries (household_id);
create index habit_entries_habit_idx on public.habit_entries (habit_id);

create trigger habits_touch before update on public.habits
  for each row execute function public.touch_updated_at();
create trigger habit_entries_touch before update on public.habit_entries
  for each row execute function public.touch_updated_at();
create trigger habits_audit after insert or update or delete on public.habits
  for each row execute function public.write_audit();
create trigger habit_entries_audit after insert or update or delete on public.habit_entries
  for each row execute function public.write_audit();

alter table public.habits enable row level security;
alter table public.habit_entries enable row level security;
create policy "household members" on public.habits for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));
create policy "household members" on public.habit_entries for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

-- ============================================================
-- list_items.assignee FK + list_catalog (see 0023, 0024)
-- ============================================================
-- list_items.assignee (declared up in the table as a bare uuid, before the
-- tenancy tables existed) becomes a real household_members reference here, the
-- same way tasks.assignee does. null = "anyone".
alter table public.list_items
  add constraint list_items_assignee_fk
  foreign key (assignee) references public.household_members(id) on delete set null;
create index list_items_assignee_idx on public.list_items (assignee);

-- Per-household catalog of items added to lists, powering add-as-you-type
-- autocomplete. Durable across grocery-run clears; a derived frequency cache
-- (kept out of the JSON backup); private-list items are never recorded (the app
-- guards on privacy at write time, so a "marc_only" list can't leak names).
create table public.list_catalog (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  text         text not null,                     -- display text, last casing used
  norm         text not null,                     -- match/dedupe key (lowercased, trimmed)
  category     text,                              -- last grocery aisle this item went to
  use_count    integer not null default 1,
  last_used_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  unique (household_id, norm)
);
create index list_catalog_household_idx on public.list_catalog (household_id, use_count desc);

alter table public.list_catalog enable row level security;
create policy "household members" on public.list_catalog for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

alter publication supabase_realtime add table public.list_catalog;

-- ------------------------------------------------------------
-- notes — a household notebook (Apple Notes-style; see migration 0029)
-- ------------------------------------------------------------
-- Rich-text documents (sanitized HTML in `body`) with free-text tags and a
-- denormalized `mentions` index of the contacts/orgs/groups they @-mention
-- inline. Household-scoped (RLS) and privacy-aware like people/tasks/lists.
create table public.notes (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  title         text,                                 -- optional; falls back to the first body line
  body          text not null default '',             -- sanitized HTML from the editor
  tags          text[] not null default '{}',         -- cross-cutting labels, like tasks.tags
  mentions      jsonb not null default '[]',          -- [{type,id}] of @-mentioned entities (from body)
  privacy_level privacy_level not null default 'shared',
  pinned        boolean not null default false,       -- sticks to the top of the Notes index
  deleted_at    timestamptz,                          -- null = live; set = in Recently Deleted (0030)
  created_by    uuid default auth.uid(),
  updated_by    uuid,                                 -- household_members.id of the last editor
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index notes_household_idx on public.notes (household_id);

create trigger notes_touch before update on public.notes
  for each row execute function public.touch_updated_at();
create trigger notes_audit after insert or update or delete on public.notes
  for each row execute function public.write_audit();

alter table public.notes enable row level security;
create policy "household members" on public.notes for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

alter publication supabase_realtime add table public.notes;

-- ------------------------------------------------------------
-- affiliations (person ↔ organization, many-to-many; see 0033)
-- ------------------------------------------------------------
-- Replaces the old people.organization_id single FK: a person can sit on a
-- board, contract for two firms, or have a job history. `role` is their title
-- AT THIS ORG (people.role now only covers contacts with no affiliation at
-- all). `show_in_summary` null = infer from organizations.type (lib/orgs.js
-- isCounterparty — a Contractor is how you know them and belongs under their
-- name; a Company is biography and doesn't); true/false overrides per row.
create table public.affiliations (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.households(id) on delete cascade,
  person_id       uuid not null references public.people(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role            text,
  is_primary      boolean not null default false,  -- the one that represents them where only one fits
  show_in_summary boolean,                         -- null = infer from the org's type
  started_on      date,
  ended_on        date,                            -- non-null = former; kept as history
  created_by      uuid default auth.uid(),
  updated_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint affiliations_unique unique (person_id, organization_id),
  constraint affiliations_dates_chk check (ended_on is null or started_on is null or ended_on >= started_on)
);
create index affiliations_household_idx on public.affiliations (household_id);
create index affiliations_person_idx on public.affiliations (person_id);
create index affiliations_org_idx on public.affiliations (organization_id);

create trigger affiliations_touch before update on public.affiliations
  for each row execute function public.touch_updated_at();
create trigger affiliations_audit after insert or update or delete on public.affiliations
  for each row execute function public.write_audit();

alter table public.affiliations enable row level security;
create policy "household members" on public.affiliations for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

alter publication supabase_realtime add table public.affiliations;
