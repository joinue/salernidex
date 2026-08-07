-- ============================================================
-- 0034_task_due_kind — "do it ON this day" vs "do it BY this day"
-- ============================================================
-- A due date has always meant two different things, and the Tasks page could
-- not tell them apart:
--
--   'on' — the task belongs to that day. A recurring chore's next occurrence, a
--          timed appointment, anything you cannot act on ahead of time.
--   'by' — the date is a DEADLINE. The task is actionable right now; the date
--          is the last acceptable moment, not an instruction to wait.
--
-- Both used to bucket into Upcoming together, which buried every 'by' task
-- under the recurring chores that make up most of a busy Upcoming list — and
-- kept it off Today until the morning it was due, exactly when the flexibility
-- has run out. 'by' tasks now get their own "Anytime" bucket above Upcoming and
-- surface on Today once the deadline is within a week.
--
-- The mirror image of start_date (0021): start_date says "not before X",
-- due_kind='by' says "not after Y". A task can carry both.
--
-- Default 'on' preserves every existing row's behavior exactly. Ignored when
-- due_date is null (a Someday task has no deadline to be flexible about).
-- Reflected in schema.sql for fresh installs. Idempotent — safe to re-run.

begin;

alter table public.tasks
  add column if not exists due_kind text not null default 'on';

-- Added separately (and guarded) so a re-run against a table that already has
-- the constraint doesn't error out.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tasks_due_kind_check'
  ) then
    alter table public.tasks
      add constraint tasks_due_kind_check check (due_kind in ('on', 'by'));
  end if;
end $$;

commit;
