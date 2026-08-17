-- ============================================================
-- 0039_reminders — a reminder is a task with nothing to do
-- ============================================================
-- "Bins go out Thursday." "Mum's birthday." Nothing to do, nothing to break
-- into steps, no sense in which it can be half-done — you just want to be told.
-- Filed as tasks they read as chores you keep failing to complete; kept in your
-- head they arrive late.
--
--   tasks.is_reminder  boolean, default false
--
-- A task row rather than a table of its own, because a reminder needs exactly
-- what a task already has: due_date, due_time, recurrence (a birthday is a
-- yearly one), assignee, privacy_level, notes, tags — plus the snooze rows, the
-- push sender, the calendar export, the @-mention backlinks and the offline
-- mutation queue that all key off tasks. A second table would mean a second
-- copy of every one of those.
--
-- Acknowledging is completion (completed_at), with different words on it: "Got
-- it", not a checkbox. The recurrence machinery then rolls the next one forward
-- for free, which is the whole trick behind yearly dates.
--
-- The check constraint is the part worth reading. This is the THIRD boolean
-- discriminator on tasks (is_project, is_heading, is_reminder), and three
-- booleans describe eight states of which only four are meaningful. A single
-- `kind` column is the better model and always was — but converting the two
-- that already exist means touching every call site, their tests, the Edge
-- Function ports and the demo data, for nothing a user could see. So: keep the
-- booleans, and make the database refuse the illegal combinations the enum
-- would have made unrepresentable. If a fourth kind ever turns up, that's the
-- signal to do the conversion properly.
--
-- Reminders are excluded from `tasks` at the data layer (see useData), not by
-- each view filtering them out — eleven files read that array and one missed
-- filter puts a birthday in your to-do list.
--
-- Additive + idempotent. An old client ignores the column and shows reminders
-- as ordinary tasks, which is where they lived before this. Mirrored in
-- schema.sql.

begin;

alter table public.tasks
  add column if not exists is_reminder boolean not null default false;

-- Partial, and keyed on due_date like tasks_due_idx beside it: reminders are a
-- small slice of the table and both readers (the Reminders page, the attention
-- engine) want them in date order. tasks isn't household-scoped — its policy is
-- blanket authenticated access — so there's no household_id to lead with.
create index if not exists tasks_reminder_idx
  on public.tasks (due_date)
  where is_reminder;

alter table public.tasks
  drop constraint if exists tasks_one_kind;

alter table public.tasks
  add constraint tasks_one_kind
    check (is_project::int + is_heading::int + is_reminder::int <= 1);

commit;
