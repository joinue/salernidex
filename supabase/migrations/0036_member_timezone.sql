-- ============================================================
-- 0036_member_timezone — one timezone per member, not one for the system
-- ============================================================
-- `TZ_NAME` was a single Edge Function secret applied to every member. It is
-- what `localNow()` uses to decide what *today* means — which tasks are due,
-- which dates fire, how habits are scheduled, what `sent_for` stamps — and what
-- *now* means, for the digest window and every per-habit and per-list reminder
-- time. There was no timezone column anywhere in the schema; the code called it
-- a "single-household assumption until go-live adds one per household."
--
-- For a member in New York that meant an 8:00 AM digest at 11:00 AM and a day
-- that rolled over at 3:00 AM their time. For Europe, a whole morning where the
-- server was still on the previous day.
--
-- Per MEMBER rather than per household on purpose: a household is a couple or a
-- family, and one of them traveling or relocating shouldn't move the other's
-- morning. The value is an IANA name, written by the client at signup from
-- Intl.DateTimeFormat().resolvedOptions().timeZone — no user input, no picker.
--
-- The default keeps every existing row behaving exactly as it did before this
-- migration, so applying it changes nobody's delivery times. Additive and
-- idempotent; safe to re-run.

begin;

alter table public.household_members
  add column if not exists timezone text not null default 'America/Phoenix';

-- Cheap sanity guard. It cannot know the full IANA set, but it does stop the
-- empty string and the obvious junk — and an unusable value would silently
-- demote that member to the default zone in localTime.ts, which is the kind of
-- wrong that never gets noticed.
alter table public.household_members
  drop constraint if exists household_members_timezone_shape;
alter table public.household_members
  add constraint household_members_timezone_shape
  check (timezone ~ '^[A-Za-z][A-Za-z0-9+_/-]*$');

comment on column public.household_members.timezone is
  'IANA zone (e.g. America/Phoenix) deciding this member''s "today" and "now" for reminders. Written at signup from the browser; see send-reminders/localTime.ts.';

commit;
