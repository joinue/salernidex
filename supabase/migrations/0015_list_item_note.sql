-- ============================================================
-- 0015_list_item_note — optional note/quantity per list item
-- ============================================================
-- List items gain a freeform note line ("2x", "the oat one, not soy") shown
-- dimmed under the item text. Mirrors tasks.notes. Defaults null; existing rows
-- are unaffected. Reflected in schema.sql for fresh installs.
-- Idempotent — safe to re-run.

begin;

alter table public.list_items
  add column if not exists note text;

commit;
