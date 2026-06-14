-- ============================================================
-- 0012_contact_channels — multiple emails/phones + social profiles
-- ============================================================
-- A person now carries more than one way to reach them. The primary
-- `email`/`phone` columns stay as the canonical pair that search, duplicate
-- detection and quick call/email already lean on; these JSONB arrays hold the
-- *additional* labeled entries plus social profiles, so the contact card can
-- match Apple Contacts (work + home + mobile, LinkedIn, etc.).
--
--   emails  : [{ "label": "Work",  "value": "x@co.com" }, ...]
--   phones  : [{ "label": "Home",  "value": "+1 555…"  }, ...]
--   socials : [{ "platform": "linkedin", "value": "handle-or-url" }, ...]
--
-- Default empty array; existing people are unaffected. Reflected in schema.sql
-- for fresh installs. Idempotent — safe to re-run.

begin;

alter table public.people
  add column if not exists emails  jsonb not null default '[]'::jsonb,
  add column if not exists phones  jsonb not null default '[]'::jsonb,
  add column if not exists socials jsonb not null default '[]'::jsonb;

commit;
