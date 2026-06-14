-- ============================================================
-- 0011_habit_today — opt a habit onto the Today dashboard
-- ============================================================
-- Habits get a per-habit "show on Today" flag so the Today screen's habits card
-- is curated by the user, not all-or-nothing. Defaults off; existing habits are
-- unaffected until pinned. Reflected in schema.sql for fresh installs.
-- Idempotent — safe to re-run.

begin;

alter table public.habits
  add column if not exists show_on_today boolean not null default false;

commit;
