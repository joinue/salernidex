-- ============================================================
-- 0021_task_start_date — defer a task until it's actionable
-- ============================================================
-- A start date (distinct from the due date) lets a task sleep until the day it
-- becomes relevant, then surface on its own — the "Upcoming vs. Today" split
-- (Things-style "When"). Until start_date arrives the task is hidden from Today
-- and the reminder sender, and buckets under Upcoming on the Tasks page.
--
--   null            = not deferred (today's behavior; every existing row)
--   'YYYY-MM-DD'     = don't surface until this date
--
-- Independent of due_date: a task can start Monday and be due Friday, start with
-- no due date ("someday, but not yet"), etc. Reflected in schema.sql for fresh
-- installs. Idempotent — safe to re-run.

begin;

alter table public.tasks
  add column if not exists start_date date;

commit;
