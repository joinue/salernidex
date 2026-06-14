-- ============================================================
-- 0012_habit_v2 — flexible frequency, rest days, and reminders
-- ============================================================
-- Three additions to habits:
--   weekly_target   — "N times per week, any day" mode (null = use active_days)
--   reminder_time   — local HH:MM to nudge; null = no reminder
--   reminder_enabled
-- and one to habit_entries:
--   skipped         — a one-off rest day; transparent to streaks (neither a
--                     success nor a break), distinct from a logged 0
--
-- All additive + defaulted, so existing rows are unaffected. Reminders ride the
-- send-reminders Edge Function, which activates with the rest of push at
-- go-live. Reflected in schema.sql for fresh installs. Idempotent.

begin;

alter table public.habits
  add column if not exists weekly_target   smallint,
  add column if not exists reminder_time   time,
  add column if not exists reminder_enabled boolean not null default false;

alter table public.habit_entries
  add column if not exists skipped boolean not null default false;

commit;
