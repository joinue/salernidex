-- ============================================================
-- 0027_people_geo — cache geocoded coordinates for people
-- ============================================================
-- The People map (see components/PeopleMap.jsx) geocodes each person's free-text
-- `address` via Nominatim (OpenStreetMap) and pins them on a Leaflet map. To keep
-- that a one-time cost per address — and to stay within Nominatim's usage policy —
-- we cache the resolved lat/lng on the row. `geocoded_address` records the exact
-- `address` string the coords came from, so the app re-geocodes only when the
-- address actually changes. All additive + nullable, so existing people are
-- untouched (they geocode on first map open). Reflected in schema.sql. Idempotent.

begin;

alter table public.people
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists geocoded_address text;

commit;
