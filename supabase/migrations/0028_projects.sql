-- ============================================================
-- 0028_projects — projects as a first-class peer of tasks
-- ============================================================
-- Projects already live in the tasks table (is_project = true with subtasks).
-- This migration adds what a *project* needs that a plain task doesn't:
--   • a date RANGE (end_date pairs with the existing start_date) — trips run
--     depart→return, renovations have a target finish.
--   • a lightweight lifecycle (project_status) for the Projects index. "Done"
--     is NOT a status value — done = completed_at is not null (single source of
--     truth, reusing task completion + history). So the index buckets are
--     Active / Someday / Done.
--   • project-scoped LISTS (lists.project_id) — a packing or materials list that
--     belongs to a project yet still appears in the global Lists view. ON DELETE
--     SET NULL: deleting the project keeps the list, just unscopes it.
--   • a per-member Projects-index sort (member_preferences.projects_sort),
--     mirroring people_sort.
--
-- Run ONCE against the live project, AFTER schema.sql and the earlier migrations.
-- These columns are also in schema.sql now (fresh installs get them), so this is
-- only for projects provisioned before it landed. Safe to re-run — every step is
-- guarded with `add column if not exists` / `create index if not exists`.
--
-- No realtime changes: tasks, lists, and member_preferences are already in the
-- supabase_realtime publication, and new columns ride the existing subscription.

begin;

-- tasks: optional project date range + lifecycle. Harmless on plain tasks
-- (which never read them); only the Projects surfaces surface them.
alter table public.tasks
  add column if not exists end_date date;                -- project target finish; pairs with start_date

alter table public.tasks
  add column if not exists project_status text not null default 'active'
    check (project_status in ('active', 'someday'));     -- 'done' is derived from completed_at, not stored here

-- lists: optional home project. A list belongs to a project AND still shows in
-- the global Lists view; unscoped when the project is deleted.
alter table public.lists
  add column if not exists project_id uuid references public.tasks(id) on delete set null;

create index if not exists lists_project_id_idx on public.lists (project_id);

-- member_preferences: Projects-index sort, mirroring people_sort.
alter table public.member_preferences
  add column if not exists projects_sort text not null default 'recent'
    check (projects_sort in ('recent', 'name', 'due'));

commit;
