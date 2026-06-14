-- ============================================================
-- 0021_habit_entry_note — a note on a day's habit entry
-- ============================================================
-- Lets a logged day carry context ("PR today", "skipped — sick") alongside its
-- value, surfaced in the backfill/day sheet and as a marker on the heatmap.
-- Mirrors the per-item notes lists already have. Additive + nullable, so
-- existing entries are unaffected. Reflected in schema.sql. Idempotent.

begin;

alter table public.habit_entries
  add column if not exists note text;

commit;
