-- ============================================================
-- 0031_list_color — optional accent color for a list
-- ============================================================
-- Mirrors habits.color: a list can carry a color that tints its emoji tile in
-- ListsView / ListDetail for quicker visual scanning. Null = the default
-- neutral fill, so existing lists are unchanged until a color is picked.
-- Reflected in schema.sql for fresh installs. Idempotent — safe to re-run.

begin;

alter table public.lists
  add column if not exists color text;

commit;
