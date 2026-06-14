-- ============================================================
-- 0023_list_item_qty_assignee — structured quantity + who's grabbing it
-- ============================================================
-- Two additions to list_items, both optional and back-compatible:
--   qty      — a structured quantity, its own column instead of stuffing it into
--              the free-text note ("2", "2 lbs", "a dozen"). Freeform text so
--              groceries stay honest; the editor steps the leading number.
--   assignee — which household member is grabbing this item (mirrors
--              tasks.assignee: a household_members FK, null = anyone). Lets a
--              couple split a shopping run: "you get the milk, I'll get bread".
-- Reflected in schema.sql for fresh installs. Idempotent — safe to re-run.

begin;

alter table public.list_items
  add column if not exists qty text,
  add column if not exists assignee uuid references public.household_members(id) on delete set null;

create index if not exists list_items_assignee_idx on public.list_items (assignee);

commit;
