-- ============================================================
-- 0014_task_priority — None / Low / Medium / High flag on tasks
-- ============================================================
-- A small integer priority (matching Apple Reminders' four levels) so a task can
-- be flagged without changing its due date. The Tasks page stays manually
-- drag-ordered; priority is a visual flag there and a tiebreaker on the
-- auto-sorted surfaces (Today / attention engine, linked-task lists, and the
-- reminder sender's digest ordering).
--
--   0 = none (default; every existing row), 1 = low, 2 = medium, 3 = high
--
-- Reflected in schema.sql for fresh installs. Idempotent — safe to re-run.

begin;

alter table public.tasks
  add column if not exists priority smallint not null default 0
    check (priority between 0 and 3);

commit;
