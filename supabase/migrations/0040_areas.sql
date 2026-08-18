-- ============================================================
-- 0040_areas — one lens over the whole app
-- ============================================================
-- `tasks.area` has been a free-text column since 0005: one category per task,
-- coined on the fly, filterable on the Tasks page and nowhere else. It works,
-- and it stops at Tasks — so a work grocery list, a work note and a work habit
-- all still land in the middle of a Saturday. This promotes it to a row and
-- gives every surface that needs one an `area_id`.
--
--   areas                      the table: name, icon, colour, order, behaviour
--   tasks/lists/notes/habits   area_id, nullable, on delete set null
--   list_items.tags            so a grocery row can join a tag page (see below)
--
-- Full reasoning in docs/scopes/areas-and-tags.md. Four decisions worth
-- repeating here, because they are the ones a reader of this file will wonder
-- about:
--
-- WHY A TABLE. Free text fragments — 'work' and 'Work' are two areas forever,
-- with no rename, no merge, no delete. It also can't carry an icon, a colour or
-- an order, and a lens you pick from a switcher needs all three. The backfill
-- below heals the casing fragmentation on the way past, for free.
--
-- WHY EVERY COLUMN AT ONCE. `shared`, `default_private` and `show_on_today`
-- have no reader in the app on the day this lands; they are phases 3 and 4.
-- They are here anyway because docs/next-steps.md §2 is explicit that additive
-- columns are free now and expensive once an old iOS build is installed on
-- someone's phone for months. A nullable boolean nobody reads costs nothing.
--
-- WHY NO CHECK CONSTRAINT ON default_private. The app's rule is that the
-- setting only exists while `shared` is false — a shared area whose contents
-- default to private is close to a contradiction. A check constraint would
-- state that invariant here, and was deliberately left out: an old client that
-- sets `shared = true` without clearing `default_private` would start getting
-- constraint violations, which is exactly the old-client break the expand-only
-- rule exists to prevent. The app clears it when sharing; the database stays
-- permissive.
--
-- WHY tasks.area SURVIVES. It is not dropped and not renamed. Dual-write it
-- and leave it: docs/next-steps.md §2b — "never drop or rename a column while
-- an older client could still be reading it." A dead text column costs nothing;
-- dropping it while a six-month-old build is still out there costs data.
--
-- An old client ignores all of this: it reads and writes `tasks.area` exactly
-- as before, never sees an area_id, and is unaffected. Additive + idempotent,
-- safe to re-run. Mirrored in schema.sql.

begin;

-- ------------------------------------------------------------
-- the table
-- ------------------------------------------------------------
create table if not exists public.areas (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.households(id) on delete cascade,
  name            text not null,
  icon            text,                            -- lib/icons.js glyph; same picker as habits/lists
  color           text,                            -- lib/colors.js key; tints the chip and the switcher, never the whole app
  sort_order      double precision,                -- manual drag order (fractional ranks, lib/order.js)
  shared          boolean not null default false,  -- does this lens exist for OTHER members. Not an ACL: item visibility is still privacy_level
  default_private boolean not null default false,  -- pre-fill new items here as private. Only meaningful while shared = false (see header)
  show_on_today   boolean not null default true,   -- off = never reaches Today, the badges, or the push sender
  archived_at     timestamptz,                     -- hidden from the switcher; its items keep their area_id and stay reachable under "All"
  created_by      uuid default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists areas_household_idx on public.areas (household_id);

-- One "Work" per person, but two people in one household may each have their
-- own — that is the whole point of `shared`, and it is what stops a shared
-- "Work" holding two different jobs. created_by is never null here (the
-- backfill attributes rows to a real member), so this stays a plain unique
-- index rather than needing a sentinel to dodge NULL-distinctness.
create unique index if not exists areas_name_uniq
  on public.areas (household_id, created_by, lower(name));

-- touch updated_at on write. Load-bearing beyond the timestamp: it is what
-- lets `areas` join GUARDED_TABLES in src/lib/mutationQueue.js and get the
-- staleness guard on queued offline writes. A table without it is
-- last-write-wins forever.
drop trigger if exists areas_touch on public.areas;
create trigger areas_touch before update on public.areas
  for each row execute function public.touch_updated_at();

drop trigger if exists areas_audit on public.areas;
create trigger areas_audit after insert or update or delete on public.areas
  for each row execute function public.write_audit();

-- RLS: plain household isolation, and deliberately NOT restricted to shared
-- areas. An area name is not a secret — when a private area's item is shared,
-- the chip on that item has to be able to render its name for whoever can see
-- the item, and an item arriving with a blanked-out chip is more confusing than
-- the name it hides. Which lens list YOU see (`shared or mine`) is an app-side
-- filter, not a policy.
alter table public.areas enable row level security;

drop policy if exists "household members" on public.areas;
create policy "household members" on public.areas for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

-- realtime: guarded add, like 0024/0029/0033. A renamed area still showing its
-- old name on the other person's phone is a small, confusing bug, and the table
-- is tiny.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'areas'
  ) then
    alter publication supabase_realtime add table public.areas;
  end if;
end $$;

-- ------------------------------------------------------------
-- the foreign keys
-- ------------------------------------------------------------
-- `on delete set null` on all four, deliberately: deleting an area must never
-- delete work. Its items fall back to No area, and the app's confirm copy says
-- so out loud ("Its 14 tasks, 2 lists and 6 notes move to No area").
alter table public.tasks  add column if not exists area_id uuid references public.areas(id) on delete set null;
alter table public.lists  add column if not exists area_id uuid references public.areas(id) on delete set null;
alter table public.notes  add column if not exists area_id uuid references public.areas(id) on delete set null;
alter table public.habits add column if not exists area_id uuid references public.areas(id) on delete set null;

create index if not exists tasks_area_idx  on public.tasks  (area_id);
create index if not exists lists_area_idx  on public.lists  (area_id);
create index if not exists notes_area_idx  on public.notes  (area_id);
create index if not exists habits_area_idx on public.habits (area_id);

-- The active lens is a per-member preference like every other one in this
-- table, so it belongs beside them rather than in localStorage: you should open
-- the laptop in the area you left the phone in.
--
-- It also has to be here for a duller reason. appPrefs mirrors the whole prefs
-- object to member_preferences and re-hydrates from it on every realtime echo —
-- so a key with no column round-trips as its default, and the lens would snap
-- back to "All" a beat after every pick. (hydrateAppPrefs now merges rather than
-- replaces, which fixes that class of bug generally; this column is what makes
-- the lens actually sync.)
--
-- `on delete set null` = deleting the area you were viewing puts you back in
-- All rather than orphaning the pref. The app's resolveAreaId() already guards a
-- stale or un-shared id on read, so a dangling value was never the risk.
alter table public.member_preferences
  add column if not exists area uuid references public.areas(id) on delete set null;

-- list_items deliberately gets NO area — it inherits its list's, because the
-- list is the unit you file. It does get tags, so a grocery row can appear on a
-- tag page beside a task and a note ("@errand" pulling the dry cleaning and the
-- milk into one list). Same shape and same flat household namespace as
-- tasks.tags (0022) and notes.tags (0029).
alter table public.list_items add column if not exists tags text[] not null default '{}';

-- ------------------------------------------------------------
-- backfill — every distinct tasks.area becomes a row
-- ------------------------------------------------------------
-- Casing is healed here: areas are keyed on lower(trim(area)) and the winning
-- display name is the spelling used most often, so a household with 30 "Work"
-- and 2 "work" ends up with one area called "Work" and no orphans.
--
-- Rows are attributed to the household's owner (falling back to its earliest
-- member) and marked `shared`, because they came from a household-wide free-text
-- column that every member could already see. Un-sharing later is one tap.
--
-- `on conflict do nothing` keeps the whole block re-runnable.
with names as (
  select household_id,
         lower(trim(area)) as key,
         trim(area)        as name,
         count(*)          as n
    from public.tasks
   where coalesce(trim(area), '') <> ''
   group by 1, 2, 3
), winners as (
  select distinct on (household_id, key) household_id, name
    from names
   order by household_id, key, n desc, name
), owners as (
  -- owner first, then whoever joined earliest — a household with no 'owner'
  -- row still gets its areas rather than silently losing them.
  select distinct on (household_id) household_id, user_id
    from public.household_members
   order by household_id, (role = 'owner') desc, joined_at
)
insert into public.areas (household_id, name, shared, created_by)
select w.household_id, w.name, true, o.user_id
  from winners w
  join owners o using (household_id)
on conflict (household_id, created_by, lower(name)) do nothing;

update public.tasks t
   set area_id = a.id
  from public.areas a
 where a.household_id = t.household_id
   and lower(a.name) = lower(trim(t.area))
   and t.area_id is distinct from a.id;

-- ------------------------------------------------------------
-- merge_area — the one operation the offline queue can't hold
-- ------------------------------------------------------------
-- Merging is "repoint every task, list, note and habit from A to B, then delete
-- A." src/lib/mutationQueue.js describes a mutation as data ({table, op, values,
-- where}) so it can be replayed after a reload — which can express those five
-- statements, and preserves their order, but cannot make them ATOMIC. If the
-- repoints exhaust MAX_ATTEMPTS and the delete lands, `on delete set null`
-- quietly unfiles every affected item and the user's merge looks like data loss.
--
-- So merge is an RPC: one function, one transaction, online-only, and the app
-- says so rather than pretending. Deleting an area outright does NOT need this
-- — the FK's `on delete set null` is already atomic, and unfiling is what that
-- operation means.
--
-- security definer to do the cross-table updates, with the membership check
-- done explicitly first, and search_path pinned as it must be on every definer
-- function in this schema.
create or replace function public.merge_area(p_from uuid, p_into uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  h_from uuid;
  h_into uuid;
begin
  if p_from is null or p_into is null or p_from = p_into then
    raise exception 'merge_area: needs two different areas';
  end if;

  select household_id into h_from from public.areas where id = p_from;
  select household_id into h_into from public.areas where id = p_into;

  if h_from is null or h_into is null then
    raise exception 'merge_area: area not found';
  end if;
  if h_from <> h_into then
    raise exception 'merge_area: areas belong to different households';
  end if;
  if not public.is_member(h_from) then
    raise exception 'merge_area: not a member of this household';
  end if;

  update public.tasks  set area_id = p_into where area_id = p_from;
  update public.lists  set area_id = p_into where area_id = p_from;
  update public.notes  set area_id = p_into where area_id = p_from;
  update public.habits set area_id = p_into where area_id = p_from;

  delete from public.areas where id = p_from;
end;
$$;

revoke all on function public.merge_area(uuid, uuid) from public;
grant execute on function public.merge_area(uuid, uuid) to authenticated;

commit;
