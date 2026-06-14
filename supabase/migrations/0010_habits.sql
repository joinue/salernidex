-- ============================================================
-- 0010_habits — personal habit tracking (build / limit / track)
-- ============================================================
-- Two tables:
--   habits         — the definition (polarity, measure, target, schedule)
--   habit_entries  — one logged value per habit per day (absence = 0)
--
-- Habits are PERSONAL: habits.member_id is the owning household member, and the
-- Habits tab shows only the current member's. Membership in a household still
-- governs row access (RLS) so the DB stays household-isolated, but the app
-- filters to the active member. Polarity decides what a "good day" means
-- (see src/lib/habits.js). Weekday scheduling via active_days (0=Sun..6=Sat;
-- empty = every day).
--
-- Born after multitenancy, so these are household-scoped from the start. Fresh
-- installs get the same definitions from schema.sql; this migration is for
-- projects provisioned earlier. Idempotent — safe to re-run.

begin;

create table if not exists public.habits (
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
  color        text,
  icon         text,
  sort_order   double precision,
  archived_at  timestamptz,                       -- archived keeps history; hidden from the active list
  deleted_at   timestamptz,
  created_by   uuid default auth.uid(),
  updated_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists habits_household_idx on public.habits (household_id);
create index if not exists habits_member_idx on public.habits (member_id);

create table if not exists public.habit_entries (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  habit_id     uuid not null references public.habits(id) on delete cascade,
  date         date not null,
  value        numeric not null default 0,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (habit_id, date)
);
create index if not exists habit_entries_household_idx on public.habit_entries (household_id);
create index if not exists habit_entries_habit_idx on public.habit_entries (habit_id);

-- touch updated_at on write
drop trigger if exists habits_touch on public.habits;
create trigger habits_touch before update on public.habits
  for each row execute function public.touch_updated_at();
drop trigger if exists habit_entries_touch on public.habit_entries;
create trigger habit_entries_touch before update on public.habit_entries
  for each row execute function public.touch_updated_at();

-- audit
drop trigger if exists habits_audit on public.habits;
create trigger habits_audit after insert or update or delete on public.habits
  for each row execute function public.write_audit();
drop trigger if exists habit_entries_audit on public.habit_entries;
create trigger habit_entries_audit after insert or update or delete on public.habit_entries
  for each row execute function public.write_audit();

-- RLS: household isolation (same pattern as every other data table)
alter table public.habits enable row level security;
alter table public.habit_entries enable row level security;

drop policy if exists "household members" on public.habits;
create policy "household members" on public.habits for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

drop policy if exists "household members" on public.habit_entries;
create policy "household members" on public.habit_entries for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

commit;
