-- ============================================================
-- 0038_list_collection — collections as a fourth list kind
-- ============================================================
-- A list of favourite restaurants is not a checklist: you never "complete" a
-- restaurant, so a row of empty circles is a question the list can't answer.
-- But it isn't a note either — it's rows you add to, reorder, section, and
-- annotate, which is a list in every respect except the checkbox.
--
--   lists.kind gains 'collection'
--
-- Behaviour lives in src/lib/listKinds.js, not here: a collection keeps every
-- list affordance except the two that imply doing (check-off, and a due date
-- on the list). No new columns — `text` is the entry, `note` is why you liked
-- it, `is_heading` still cuts it into sections, `sort_order` still orders it.
--
-- Widening a check constraint is expand-only and safe for an old client: it
-- never writes 'collection', and one reading a collection falls through to its
-- standard-list branch — which shows checkboxes, the pre-0038 behaviour, and
-- nothing worse. Additive + idempotent. Mirrored in schema.sql.

begin;

alter table public.lists
  drop constraint if exists lists_kind_check;

alter table public.lists
  add constraint lists_kind_check
    check (kind in ('standard', 'grocery', 'meal_plan', 'collection'));

commit;
