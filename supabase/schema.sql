-- ============================================================
-- SALERNIDEX — Supabase schema
-- Run this in the Supabase SQL Editor (Dashboard -> SQL Editor)
-- ============================================================

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
  keep_in_touch_days integer,              -- stay-in-touch cadence in days; null/0 = off
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
--   - recurring chore: recur_days > 0 (rolls forward on completion)
--   - project: a task with subtasks (children via parent_id) and/or
--     is_project = true; projects get the richer ProjectDetail page and can
--     have people/orgs attached via task_links (e.g. a contractor)
--   - assignee: which household member ('either' | 'me' | 'partner')
-- ------------------------------------------------------------
create table public.tasks (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  notes         text,
  assignee      text not null default 'either',     -- either | me | partner
  due_date      date,
  recurrence    jsonb,                              -- null = one-off; RRULE-lite (see lib/recurrence.js)
  parent_id     uuid references public.tasks(id) on delete cascade,  -- subtask of a project
  is_project    boolean not null default false,     -- explicit project flag (also implied by having subtasks)
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
  completed_by text,                              -- me | partner | null (either/unknown)
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
returns trigger language plpgsql as $$
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
create or replace function public.write_audit()
returns trigger language plpgsql security definer as $$
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
create policy "authenticated read audit" on public.audit_log
  for select to authenticated using (true);

-- ------------------------------------------------------------
-- Helpful indexes for search
-- ------------------------------------------------------------
create index people_name_idx on public.people using gin (to_tsvector('simple', name));
create index people_tags_idx on public.people using gin (tags);
create index relationships_a_idx on public.relationships (person_a_id);
create index relationships_b_idx on public.relationships (person_b_id);
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
create table public.households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'Our Household',
  join_code   text not null unique default encode(gen_random_bytes(4), 'hex'),
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
  role          text not null default 'member',  -- owner | member
  joined_at     timestamptz not null default now(),
  unique (household_id, user_id)
);

-- Membership test, used by every table's RLS policy.
create or replace function public.is_member(hid uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = auth.uid()
  );
$$;

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
--     using (public.is_member(household_id))
--     with check (public.is_member(household_id));
--
-- Repeat for all data tables. households: members can select/update their own
-- (owner to update); household_members: members can see co-members.

-- assignee / completed_by become household_member references instead of the
-- 'either|me|partner' text used in the demo:
--   alter table public.tasks
--     alter column assignee drop default,
--     alter column assignee type uuid using null,   -- null = "anyone"
--     add constraint tasks_assignee_fk
--       foreign key (assignee) references public.household_members(id) on delete set null;
--   alter table public.task_completions
--     alter column completed_by type uuid using null,
--     add constraint completions_by_fk
--       foreign key (completed_by) references public.household_members(id) on delete set null;

-- Join a household by code (run as the signed-in user). Returns the membership.
create or replace function public.join_household(code text, name text default '')
returns public.household_members language plpgsql security definer as $$
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

-- Note: the privacy_level enum value 'marc_only' should be renamed to a generic
-- 'private' as part of this migration (it's couple-specific). Also consider a
-- `profiles` table (user_id, default_household_id) to remember the last-used
-- household for the switcher.
