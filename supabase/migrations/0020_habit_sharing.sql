-- ============================================================
-- 0020_habit_sharing — make a habit visible to the household
-- ============================================================
-- Habits are personal by default (owned by their member_id). `shared` opts one
-- into household visibility: other members see it read-only in a "Shared with
-- you" section — the couple's-OS dimension no mainstream tracker has.
--
-- RLS already lets any household member SELECT every habit row (the "household
-- members" policy), so this flag is purely an app-level visibility opt-in; it
-- doesn't loosen the database. Additive + defaulted, so existing rows stay
-- private. Reflected in schema.sql for fresh installs. Idempotent.

begin;

alter table public.habits
  add column if not exists shared boolean not null default false;

commit;
