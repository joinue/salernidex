-- ============================================================
-- 0032_org_contact — organizations can be contacted directly
-- ============================================================
-- An org row was name + type + description + tags: enough to label a person,
-- not enough to BE a contact. That forced every vendor to be entered as a
-- person ("Dana" with the plumbing company's number on her), which is why an
-- org name had to ride along under a person's name everywhere — the org
-- couldn't stand on its own.
--
-- These four columns let a counterparty org (contractor, doctor's office,
-- utility, school) be a complete record with no person attached at all. Same
-- shape as the corresponding people columns, so OrgPage can render the same
-- tap-to-call / mailto / map value rows PersonPage does.
--
-- No geocoding here: people.latitude/longitude (0027) back the People map, and
-- orgs aren't plotted on it yet. `address` is stored as typed; adding the geo
-- columns is a separate change if orgs ever join the map.
--
-- Fresh installs get the same columns from schema.sql; this is for projects
-- provisioned earlier. Idempotent — safe to re-run.

begin;

alter table public.organizations add column if not exists phone   text;
alter table public.organizations add column if not exists email   text;
alter table public.organizations add column if not exists website text;
alter table public.organizations add column if not exists address text;

commit;
