-- ============================================================
-- 0019_list_types_and_sections — grocery list type + sections
-- ============================================================
-- Lists gain a `kind` discriminator (mirrors groups.kind):
--   'standard' — a plain checklist; may carry hand-made section headings
--   'grocery'  — items auto-group into aisles, with a per-item override
-- and list_items gain the two columns those two modes need:
--   category   — grocery aisle ("Produce", "Dairy"…); null = "Other". Auto-set
--                from a keyword map on add (src/lib/aisles.js), user-overridable
--   is_heading — a Things-style section row on a standard list; the items that
--                follow it in sort_order belong to that section (see tasks.is_heading)
-- All default to the current behavior, so existing lists are unchanged.
-- Reflected in schema.sql for fresh installs. Idempotent — safe to re-run.

begin;

alter table public.lists
  add column if not exists kind text not null default 'standard'
    check (kind in ('standard', 'grocery'));

alter table public.list_items
  add column if not exists category text,                       -- grocery aisle; null = "Other"
  add column if not exists is_heading boolean not null default false;

commit;
