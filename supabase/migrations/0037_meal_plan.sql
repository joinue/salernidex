-- ============================================================
-- 0037_meal_plan — meal plans as a third list kind
-- ============================================================
-- A meal plan is a list whose items are indexed by DATE rather than by
-- sort order or aisle: "Tacos on Tuesday", not "Tacos, third from the top".
-- Everything else about a list already fits — an item's `text` is the dish,
-- its `note` carries the ingredients, `assignee` is who's cooking, and
-- `checked_at` means it got made. So this is the same widening 0019 did when
-- it added 'grocery', plus the one column that axis needs.
--
--   lists.kind          gains 'meal_plan'
--   list_items.on_date  which day this item belongs to; null = unscheduled
--
-- `on_date` is deliberately on the ITEM, not the list: lists.due_date (0016)
-- is a single "get it all by" date for the whole list, which is the wrong
-- shape for seven dinners. It stays null on standard and grocery lists, so
-- nothing existing changes.
--
-- Widening a check constraint is expand-only and safe for old clients: they
-- never write 'meal_plan', and one reading a meal-plan list falls through to
-- its standard-list branch (kind === 'grocery' is simply false) rather than
-- breaking. Additive + idempotent. Reflected in schema.sql for fresh installs.

begin;

-- Postgres names an inline column check `<table>_<column>_check`; 0019 created
-- it that way. Drop-and-recreate is the only way to widen one.
alter table public.lists
  drop constraint if exists lists_kind_check;

alter table public.lists
  add constraint lists_kind_check
    check (kind in ('standard', 'grocery', 'meal_plan'));

alter table public.list_items
  add column if not exists on_date date;                -- meal-plan day; null = unscheduled

-- The meal-plan surface reads one list over a rolling date window, which is
-- exactly this index. Partial: only meal-plan rows ever set it.
create index if not exists list_items_on_date_idx
  on public.list_items (list_id, on_date)
  where on_date is not null;

commit;
