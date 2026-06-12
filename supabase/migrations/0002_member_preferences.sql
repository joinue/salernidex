-- ============================================================
-- 0002_member_preferences — per-member app preferences table
-- ============================================================
-- Adds the live home for src/lib/appPrefs.js: the visibility new items start
-- with (tasks / lists / people), how the Tasks page opens (who-filter +
-- show-completed), and the People-page sort. Modeled on notification_prefs —
-- one row per member, "own rows" RLS, realtime.
--
-- Run ONCE against the live project, AFTER schema.sql and 0001_multitenancy.
-- This is also in schema.sql now (so fresh installs get it), so this migration
-- is only for projects provisioned before it landed. Safe to re-run — every
-- step is guarded (if not exists / drop … if exists).
--
-- Depends on objects schema.sql already created: the privacy_level enum, the
-- household_members table, and the is_own_member() / touch_updated_at()
-- functions. Theme stays per-device (localStorage), so it is NOT here.

begin;

-- task_filter null = "Everyone"; set to a member to default that page to them
-- (on delete set null falls back to Everyone, matching the client guard).
create table if not exists public.member_preferences (
  id                     uuid primary key default gen_random_uuid(),
  member_id              uuid not null unique references public.household_members(id) on delete cascade,
  default_task_privacy   privacy_level not null default 'shared',
  default_list_privacy   privacy_level not null default 'family_shared',
  default_person_privacy privacy_level not null default 'shared',
  task_filter            uuid references public.household_members(id) on delete set null,
  show_completed         boolean not null default false,
  people_sort            text not null default 'name' check (people_sort in ('name', 'recent', 'tier')),
  updated_at             timestamptz not null default now()
);

drop trigger if exists member_preferences_touch on public.member_preferences;
create trigger member_preferences_touch before update on public.member_preferences
  for each row execute function public.touch_updated_at();

alter table public.member_preferences enable row level security;

drop policy if exists "own rows" on public.member_preferences;
create policy "own rows" on public.member_preferences for all to authenticated
  using (public.is_own_member(member_id)) with check (public.is_own_member(member_id));

-- Realtime: add to the publication only if it isn't already a member, so the
-- migration stays re-runnable (a plain ADD TABLE errors on the second run).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'member_preferences'
  ) then
    alter publication supabase_realtime add table public.member_preferences;
  end if;
end $$;

commit;
