-- ============================================================
-- 0030_notes_soft_delete — Recently Deleted for notes
-- ============================================================
-- Notes get a soft-delete column so "Delete" moves a note to a Recently Deleted
-- folder (restore or delete-forever from there), à la Apple Notes, instead of
-- vanishing on the spot. The app filters deleted_at out of the live notebook and
-- surfaces the trashed rows in their own view.
--
-- Reflected in schema.sql for fresh installs. Idempotent — safe to re-run.

begin;

alter table public.notes
  add column if not exists deleted_at timestamptz; -- null = live; set = in Recently Deleted

commit;
