-- ============================================================
-- 0022_task_tags — cross-cutting labels on tasks
-- ============================================================
-- Tasks get a tags array (same shape as people/organizations tags) for
-- cross-cutting views the single `area` field can't express — @errand, @home,
-- @waiting-on — filterable on the Tasks page regardless of project or area.
-- area stays the one primary category; tags are the many secondary labels.
--
-- Reflected in schema.sql for fresh installs. Idempotent — safe to re-run.

begin;

alter table public.tasks
  add column if not exists tags text[] not null default '{}';

commit;
