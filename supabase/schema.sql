-- ============================================================
-- SALERNIDEX — Supabase schema
-- Run this in the Supabase SQL Editor (Dashboard -> SQL Editor)
-- as ONE migration at go-live, top to bottom.
-- ============================================================

-- gen_random_bytes (households.join_code) lives in pgcrypto. Usually enabled
-- on Supabase, but don't bet a migration on "usually".
create extension if not exists pgcrypto with schema extensions;

-- Privacy enum
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
  organization  text,
  role          text,
  email         text,
  phone         text,
  birthday      date,
  address       text,
  tags          text[] not null default '{}',
  tier          text check (tier in ('inner', 'close', 'network')),  -- relationship tier; null = unsorted
  family_id     uuid references public.families(id) on delete set null,
  privacy_level privacy_level not null default 'shared',
  notes         text,
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
  type          text,                       -- Company, Government, Nonprofit, Community
  description   text,
  key_contacts  text[] not null default '{}',
  tags          text[] not null default '{}',
  privacy_level privacy_level not null default 'shared',
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

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
-- groups (smart groups: membership = tag logic AND / OR / NOT)
-- ------------------------------------------------------------
create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  all_tags    text[] not null default '{}',   -- person must have ALL of these
  any_tags    text[] not null default '{}',   -- ...and at least ONE of these (if any listed)
  none_tags   text[] not null default '{}',   -- ...and NONE of these
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
  due_date      date,
  recurrence    jsonb,                              -- null = one-off; RRULE-lite (see lib/recurrence.js)
  parent_id     uuid references public.tasks(id) on delete cascade,  -- subtask of a project
  constraint no_self_parent check (parent_id <> id),
  is_project    boolean not null default false,     -- explicit project flag (also implied by having subtasks)
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
  entity_type text not null,                       -- person | organization
  entity_id   uuid not null,
  role        text,                                -- optional, e.g. 'plumber', 'contractor'
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  constraint task_links_entity_type_chk check (entity_type in ('person', 'organization')),
  constraint task_links_unique unique (task_id, entity_type, entity_id)
);

-- ------------------------------------------------------------
-- lists + list_items (shared household lists: groceries, shopping, custom)
-- ------------------------------------------------------------
create table public.lists (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  icon          text,                               -- emoji, e.g. 🛒
  privacy_level privacy_level not null default 'family_shared',
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.list_items (
  id          uuid primary key default gen_random_uuid(),
  list_id     uuid not null references public.lists(id) on delete cascade,
  text        text not null,
  checked_at  timestamptz,                          -- null = not yet got/done
  sort_order  double precision,                     -- manual drag order (see tasks.sort_order)
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
-- Row Level Security
-- Single shared account model: any authenticated user has full
-- access. privacy_level filtering happens in the app UI.
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
-- MULTITENANCY — DESIGN (to apply at go-live; not yet wired)
-- ------------------------------------------------------------
-- Moves the app from "one shared account sees everything" to per-user accounts
-- that belong to one or more households, with row isolation by household.
-- Built in the app against an in-memory/localStorage household for now
-- (src/lib/household.js); this section is the live counterpart.
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
declare h public.households; m public.household_members;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  insert into public.households (name, created_by)
  values (coalesce(nullif(household_name, ''), 'Our Household'), auth.uid())
  returning * into h;
  insert into public.household_members (household_id, user_id, display_name, role)
  values (h.id, auth.uid(), coalesce(member_name, ''), 'owner')
  returning * into m;
  return m;
end $$;

-- The join/create RPCs are the front door — signed-in users only.
revoke execute on function public.create_household(text, text) from anon;

-- EVERY data table gets `household_id uuid not null references households(id)`
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
--            and (privacy_level <> 'marc_only' or created_by = auth.uid()))
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

-- assignee / completed_by become household_member references instead of the
-- label text used in the demo (USING must cast — bare `using null` is a
-- syntax error):
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
create or replace function public.join_household(code text, name text default '')
returns public.household_members language plpgsql security definer set search_path = public as $$
declare h public.households; m public.household_members;
begin
  select * into h from public.households where join_code = code;
  if not found then raise exception 'Invalid join code'; end if;
  insert into public.household_members (household_id, user_id, display_name)
  values (h.id, auth.uid(), coalesce(nullif(name,''), ''))
  on conflict (household_id, user_id) do update set display_name = excluded.display_name
  returning * into m;
  return m;
end $$;

revoke execute on function public.join_household(text, text) from anon;

-- Member renames / joins sync live across devices (RLS filters events):
alter publication supabase_realtime add table public.households;
alter publication supabase_realtime add table public.household_members;

-- Note: the privacy_level enum value 'marc_only' should be renamed to a generic
-- 'private' as part of this migration (it's couple-specific). Also consider a
-- `profiles` table (user_id, default_household_id) to remember the last-used
-- household for the switcher.


-- ============================================================
-- PHASE 6 - reminders & notifications (live design; not yet wired)
-- ============================================================
-- The in-app attention layer (6a) runs demo-first: snoozes/prefs live in
-- memory + localStorage and round-trip through the JSON backup. This section
-- is the live counterpart, plus the push-delivery model (6b) that only makes
-- sense with a server. Per-member references use household_members(id), so
-- these tables assume the multitenancy section above is applied first.

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
  nudges          boolean not null default true,
  dates           boolean not null default true,
  fyi             boolean not null default false,
  dates_lead_days integer not null default 7 check (dates_lead_days between 1 and 60),
  digest_time     time not null default '08:00',
  updated_at      timestamptz not null default now()
);

create trigger notification_prefs_touch before update on public.notification_prefs
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
create policy "own rows" on public.push_subscriptions for all to authenticated
  using (public.is_own_member(member_id)) with check (public.is_own_member(member_id));
create policy "own rows read" on public.notification_log for select to authenticated
  using (public.is_own_member(member_id));
-- notification_log inserts happen via the service-role sender, not clients.

-- Snoozes sync across a member's devices live:
alter publication supabase_realtime add table public.reminder_snoozes;
alter publication supabase_realtime add table public.notification_prefs;

-- Scheduler (6b): pg_cron invokes the send-reminders Edge Function every
-- 15 minutes. The function recomputes the same attention rules as
-- src/lib/reminders.js server-side, applies prefs + snoozes, dedupes via
-- notification_log, and web-pushes (VAPID) to each member's subscriptions:
--
--   select cron.schedule('send-reminders', '*/15 * * * *', $$
--     select net.http_post(
--       url    := '<project>.supabase.co/functions/v1/send-reminders',
--       headers:= jsonb_build_object('Authorization', 'Bearer <service-role-key>')
--     )
--   $$);
--
-- Skeleton: supabase/functions/send-reminders/index.ts. VAPID keys live in
-- function secrets (SUPABASE_VAPID_PUBLIC/PRIVATE), the public key is also
-- exposed to the client as VITE_VAPID_PUBLIC_KEY for subscribe().
