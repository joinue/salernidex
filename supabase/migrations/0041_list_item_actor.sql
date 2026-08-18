-- ============================================================
-- 0041_list_item_actor — say who did it on the list feed
-- ============================================================
-- The activity feed collapses a whole list into one line ("Home Improvement —
-- Added grout sealer"), and that line was the only kind in the feed with no
-- name on it. Task completions have carried `completed_by` since the start;
-- list activity carried nobody, so the one surface whose entire job is telling
-- a household what each other did quietly dropped the subject of the sentence.
--
-- Adding was already recoverable: list_items.created_by has existed since the
-- table did, defaulting to auth.uid() — the feed just never read it. Checking
-- off was not, hence this migration:
--
--   list_items.checked_by  uuid, null
--
-- Nullable with no default, deliberately. `default auth.uid()` would be wrong
-- here: unlike created_by, which is written exactly once at insert by the
-- person inserting, checked_by is written by an UPDATE that also runs when an
-- item is UNchecked — and a default would then credit the unchecker. useData
-- writes the id on check and nulls it on uncheck, which is the only place that
-- knows which direction the toggle went.
--
-- No backfill. Items checked off before today have no record of who did it and
-- inventing one would be worse than the blank; those rows render without a
-- name, exactly as they do now. Same for created_by on rows predating the
-- column's default.
--
-- Note the id space: created_by/checked_by hold an AUTH USER id (auth.uid()),
-- while tasks.assignee and task_completions.completed_by hold a
-- household_members id. They are not interchangeable, which is why the client
-- resolves actors through household.actorLabel() rather than assigneeLabel().
--
-- Additive + idempotent. An old client ignores the column; its check-offs land
-- with checked_by null and simply show no name. Mirrored in schema.sql.

begin;

alter table public.list_items
  add column if not exists checked_by uuid;

commit;
