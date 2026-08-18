-- ============================================================
-- 0042_business_areas — a lens can be business-related, and a
--                       contact can be reached through one
-- ============================================================
-- The use case this answers: one person, one household, two lives — personal
-- relationships plus a business. Areas already partition everything the
-- household DOES. They deliberately do not touch contacts, and
-- docs/scopes/areas-and-tags.md §3.2 is right about why:
--
--   a colleague who becomes a friend is not 40%-work, they're *both*,
--   permanently. You do not want a person to vanish because you're in Work mode.
--
-- That argument settles one question — whether an area may HIDE a contact — and
-- was being used to settle a second one it doesn't reach: whether work-shaped
-- relationship pressure can be scoped. Those come apart badly. Under the Home
-- lens on a Sunday, "check in with a prospect" sat beside "call Mom", and
-- switching Work off Today silenced its tasks and lists while its follow-up
-- pings kept arriving. There was no way to say "the business is closed".
--
-- So the split this migration makes is between FILING and HIDING:
--
--   areas.is_business        the lens knows it's a business one
--   people.context_area_id   which part of your life you know someone through
--
-- and the rule that keeps §3.2 intact is that `context_area_id` is ADDITIVE
-- ONLY. It changes what a contact's record OFFERS — business tiers, weekly
-- cadences, renewal-shaped key dates — and whether its check-in can be muted
-- with the rest of that area. It must never filter the People page. A contact
-- filed under Work stays visible under every lens, exactly as before.
--
-- The column is called `context_area_id` and not `area_id` on purpose. Every
-- other area_id in this schema means "scoped by the lens", so a column named
-- area_id on people is an invitation for someone — quite possibly its author, in
-- four months — to wire it into the People filter because that's what the name
-- promises. This name makes the wrong change read wrong at the call site. It is
-- also why `people` stays out of AREA_SCOPED_ROUTES in src/lib/nav.js, with a
-- comment saying so.
--
-- The second half of this migration is unrelated to areas and long overdue:
-- ORGANIZATIONS GET A TOUCHPOINT LOG AND A CADENCE. 0032 made an org a
-- contactable record and 0033 gave it people; the follow-up half never came, so
-- the account you actually manage — the client company, whose contact person may
-- change twice a year — could be phoned but not followed up with, and had no
-- history. interactions.person_id drops to nullable and gains an
-- organization_id sibling, with a check constraint saying exactly one is set.
--
-- Additive throughout. An old client ignores every column here: contacts read as
-- unfiled (which is what they are today), orgs show no cadence, and a touchpoint
-- logged against an org is simply a row it never selects.
--
-- The other direction — a NEW client writing an OLD database — is the one that
-- bites during a deploy window, since PostgREST fails the whole write on one
-- unknown column. useData only carries the column-learning guard for
-- member_preferences (see prefColumns there, and what `area` did at 0040). So:
-- RUN THIS BEFORE DEPLOYING the build that writes these columns, exactly as
-- 0040 required.

begin;

-- ── 1. Areas can be business-related ────────────────────────────────────────
-- A plain boolean, not a `kind` enum. There are exactly two states and the
-- second one only unlocks fields; an enum would invite a third ("side project"?)
-- that would have to mean something on every surface below.
alter table public.areas
  add column if not exists is_business boolean not null default false;

-- ── 2. Contacts carry the context they're known through ─────────────────────
-- `on delete set null` like every other area reference (0040): deleting an area
-- must never delete work, and here it must never delete a person.
alter table public.people
  add column if not exists context_area_id uuid references public.areas(id) on delete set null;

create index if not exists people_context_area_idx on public.people (context_area_id);

-- Note what is NOT here: no index pairing context_area_id with anything the
-- People list sorts by, because the People list must never filter on it. If a
-- query plan ever wants one, that's the signal something has started using this
-- column as a lens — read the header again before adding it.

-- ── 3. people.tier accepts the business vocabulary ──────────────────────────
-- The old constraint listed the five personal tiers. Business contacts need a
-- role rather than a closeness rung, and both sets stay legal on every contact:
-- retyping an area must not silently blank a tier someone chose. Which set is
-- OFFERED is the picker's job (src/lib/constants.js tiersFor), never the
-- database's.
alter table public.people
  drop constraint if exists people_tier_check;

alter table public.people
  add constraint people_tier_check check (
    tier is null or tier in (
      'family', 'inner', 'close', 'network', 'acquaintance',
      'client', 'prospect', 'partner', 'vendor', 'advisor'
    )
  );

-- ── 4. Organizations get a cadence ──────────────────────────────────────────
-- Same shape and same semantics as people.keep_in_touch_days: days, null/0 off.
alter table public.organizations
  add column if not exists keep_in_touch_days integer
    check (keep_in_touch_days is null or keep_in_touch_days >= 0);

-- An org is a counterparty, not a friend, so it gets the context column too —
-- your accountant belongs to Work in exactly the way your sister does not.
alter table public.organizations
  add column if not exists context_area_id uuid references public.areas(id) on delete set null;

-- ── 5. Touchpoints can be logged against an organization ────────────────────
-- person_id was `not null` since the table existed. Dropping that is safe in the
-- additive sense — every existing row keeps its person — but it does mean the
-- "exactly one subject" rule now has to be stated, or a row with neither (or
-- both) becomes representable and every reader has to guess.
alter table public.interactions
  alter column person_id drop not null;

alter table public.interactions
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

alter table public.interactions
  drop constraint if exists interactions_subject_chk;

alter table public.interactions
  add constraint interactions_subject_chk check (
    (person_id is not null and organization_id is null)
    or (person_id is null and organization_id is not null)
  );

create index if not exists interactions_org_idx on public.interactions (organization_id);

-- A touchpoint is editable now (it was insert-and-delete only, which made the
-- log a streak counter rather than a record), so it wants to say when it was
-- last corrected. Backfilled to created_at: an untouched row was last written
-- when it was written.
alter table public.interactions
  add column if not exists updated_at timestamptz;

update public.interactions set updated_at = created_at where updated_at is null;

alter table public.interactions
  alter column updated_at set default now(),
  alter column updated_at set not null;

drop trigger if exists interactions_touch on public.interactions;
create trigger interactions_touch before update on public.interactions
  for each row execute function public.touch_updated_at();

commit;
