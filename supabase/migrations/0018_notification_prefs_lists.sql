-- ============================================================
-- 0018_notification_prefs_lists — persist the "Lists" notification toggle
-- ============================================================
-- The client gained a per-member "Lists" notification toggle (a list with a due
-- date reaching today/overdue), but notification_prefs had no column for it, so
-- it could only ever live in localStorage. Add it so the toggle persists and
-- syncs across a member's devices like the rest of their prefs. Additive +
-- defaulted (true, matching DEFAULT_PREFS), so existing rows are unaffected.
-- Reflected in schema.sql. Idempotent.

begin;

alter table public.notification_prefs
  add column if not exists lists boolean not null default true;

commit;
