-- ============================================================
-- 0016_list_due — due date + reminder for a whole list
-- ============================================================
-- A list can carry a due_date (e.g. "Groceries by Fri") plus an optional local
-- reminder_time nudge, mirroring habits.reminder_time/reminder_enabled. A list
-- with a due date surfaces on Today and (via the send-reminders Edge Function)
-- as a push, through the one attention engine in src/lib/reminders.js. Defaults
-- keep existing lists silent until a date is set. Reflected in schema.sql for
-- fresh installs.
-- Idempotent — safe to re-run.

begin;

alter table public.lists
  add column if not exists due_date date,
  add column if not exists reminder_time time,                 -- local HH:MM nudge; null = none
  add column if not exists reminder_enabled boolean not null default false;

create index if not exists lists_due_idx on public.lists (due_date) where due_date is not null;

commit;
