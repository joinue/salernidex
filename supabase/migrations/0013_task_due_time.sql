-- ============================================================
-- 0013_task_due_time — optional time-of-day on a task's due date
-- ============================================================
-- Until now a task's deadline was a bare calendar date (all-day, like Apple
-- Reminders with the time switched off). due_time adds an optional local clock
-- time so a task can be "due at 3:00 PM", which is what lets the reminder sender
-- ping at the right moment instead of only in the morning digest.
--
--   - null  = all-day (existing behaviour; unchanged for every current row)
--   - 'HH:MM[:SS]' (local time) = a timed deadline
--
-- Only meaningful alongside due_date; the UI never sets a time without a date.
-- Recurrence rolls due_date forward on completion and leaves due_time intact, so
-- "trash out every Monday at 8pm" keeps its time. Reflected in schema.sql for
-- fresh installs. Idempotent — safe to re-run.

begin;

alter table public.tasks
  add column if not exists due_time time;

commit;
