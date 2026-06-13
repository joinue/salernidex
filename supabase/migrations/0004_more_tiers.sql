-- ============================================================
-- 0004_more_tiers — widen the people.tier CHECK constraint
-- ============================================================
-- Adds two relationship tiers around the original three:
--   'family' (closest) and 'acquaintance' (loosest).
-- The ordering closest→loosest lives in lib/constants.js (TIERS / TIER_RANK)
-- and drives the tier sort; the DB only enforces the allowed value set.
--
-- Run ONCE against the live project, AFTER schema.sql. This is also reflected
-- in schema.sql now (so fresh installs get it), so this migration is only for
-- projects provisioned before it landed. Safe to re-run.
--
-- No data backfill needed: existing 'inner'/'close'/'network'/null rows all
-- still satisfy the widened constraint.

begin;

alter table public.people drop constraint if exists people_tier_check;
alter table public.people add constraint people_tier_check
  check (tier in ('family', 'inner', 'close', 'network', 'acquaintance'));

commit;
