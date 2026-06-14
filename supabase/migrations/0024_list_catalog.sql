-- ============================================================
-- 0024_list_catalog — remembered items for add-as-you-type autocomplete
-- ============================================================
-- A per-household catalog of items added to lists ("what we usually buy"), so
-- typing "mi" suggests "Milk" with its learned aisle — the master-list trick
-- AnyList/Bring lean on. It's the durable memory that survives a grocery run:
-- list_items rows get cleared after shopping, but the catalog keeps counting.
--
-- A derived frequency cache, regenerable from usage — deliberately NOT included
-- in the JSON backup (it rebuilds as the household uses lists). Private-list
-- items are never written here (the app guards on privacy at write time), so a
-- "private" list can't leak item names to a partner through suggestions.
-- Reflected in schema.sql for fresh installs. Idempotent — safe to re-run.

begin;

create table if not exists public.list_catalog (
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

create index if not exists list_catalog_household_idx
  on public.list_catalog (household_id, use_count desc);

alter table public.list_catalog enable row level security;
drop policy if exists "household members" on public.list_catalog;
create policy "household members" on public.list_catalog for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

-- Realtime: add to the publication only if it isn't already a member, so the
-- migration stays re-runnable (a plain ADD TABLE errors on the second run).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'list_catalog'
  ) then
    alter publication supabase_realtime add table public.list_catalog;
  end if;
end $$;

commit;
