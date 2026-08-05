-- ============================================================
-- 0029_notes — a household notebook (Apple Notes-style)
-- ============================================================
-- One table: notes. A note is a rich-text document (sanitized HTML in `body`),
-- with free-text `tags` (same shape as tasks.tags, 0022) and a denormalized
-- `mentions` index of the contacts / organizations / groups it @-mentions
-- inline. Mentions live in the body as chip spans; `mentions` mirrors them as
-- [{type,id}] so an entity's page can list the notes that reference it without
-- a join table (the app filters in memory, like every other cross-link).
--
-- Notes are household-scoped (RLS isolation) and honor the same privacy model as
-- people/tasks/lists: privacy_level 'private' = only the creator; anything else
-- = the whole household. Born after multitenancy, so household_id is required
-- from the start. Fresh installs get the same table from schema.sql; this
-- migration is for projects provisioned earlier. Idempotent — safe to re-run.

begin;

create table if not exists public.notes (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  title         text,                                 -- optional; falls back to the first body line
  body          text not null default '',             -- sanitized HTML from the editor
  tags          text[] not null default '{}',         -- cross-cutting labels, like tasks.tags (0022)
  mentions      jsonb not null default '[]',          -- [{type,id}] of @-mentioned entities (denormalized from body)
  privacy_level privacy_level not null default 'shared',
  pinned        boolean not null default false,       -- sticks to the top of the Notes index
  created_by    uuid default auth.uid(),
  updated_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists notes_household_idx on public.notes (household_id);

-- touch updated_at on write
drop trigger if exists notes_touch on public.notes;
create trigger notes_touch before update on public.notes
  for each row execute function public.touch_updated_at();

-- audit
drop trigger if exists notes_audit on public.notes;
create trigger notes_audit after insert or update or delete on public.notes
  for each row execute function public.write_audit();

-- RLS: household isolation (same pattern as every other data table)
alter table public.notes enable row level security;

drop policy if exists "household members" on public.notes;
create policy "household members" on public.notes for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

-- realtime: add to the publication if not already a member (guarded, like 0024)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notes'
  ) then
    alter publication supabase_realtime add table public.notes;
  end if;
end $$;

commit;
