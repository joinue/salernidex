-- ============================================================
-- 0026_habit_rrule — flexible recurrence for habits
-- ============================================================
-- Adds an RRULE-lite rule (the same shape tasks use, see lib/recurrence.js) so a
-- habit can repeat every N days, every N weeks, monthly (by date or weekday), or
-- yearly — beyond the existing weekday-set / "N times per week" modes. When set,
-- `rrule` is the schedule and `active_days` / `weekly_target` are ignored (the
-- form clears them). Additive + nullable, so existing habits keep their current
-- scheduling untouched. Reflected in schema.sql. Idempotent.

begin;

alter table public.habits
  add column if not exists rrule jsonb;

commit;
