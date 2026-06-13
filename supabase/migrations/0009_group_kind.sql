-- ============================================================
-- 0009_group_kind — groups can be hand-picked, not only tag-rule based
-- ============================================================
-- Groups were always "smart": membership = AND/OR/NOT over tags. That's great
-- for slicing by attribute ("all vendors") but clumsy for the common household
-- case — a deliberate, curated set ("cabin trip crew", "holiday card list")
-- that doesn't correspond to any tag. This adds a second mode:
--
--   kind='smart'  → membership from all_tags/any_tags/none_tags (unchanged)
--   kind='manual' → membership is exactly the people in member_ids
--
-- One entity, two modes — no second "lists of people" concept. Existing rows
-- are all smart (the default), so this is purely additive and safe to re-run.
-- Also reflected in schema.sql for fresh installs.

begin;

alter table public.groups
  add column if not exists kind text not null default 'smart',
  add column if not exists member_ids uuid[] not null default '{}';

alter table public.groups drop constraint if exists groups_kind_check;
alter table public.groups
  add constraint groups_kind_check check (kind in ('smart', 'manual'));

commit;
