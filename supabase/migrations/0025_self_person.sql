-- ============================================================
-- 0025_self_person — every member gets a "self" contact card
-- ============================================================
-- A household member is an account; a person is a rolodex entry. Until now they
-- were unrelated, so you never had your OWN card and members showed only a
-- monogram. This links each membership to a self-person: the card you'd hand
-- someone as your contact, and whose photo becomes your avatar across the
-- household (Settings, assignee pickers, the home nudge).
--
-- The link lives on household_members (one member ↔ at most one card). ON DELETE
-- SET NULL so archiving the card never breaks membership — it just unlinks, and
-- the Settings photo affordance re-creates one on demand.
--
-- New members are handled in the create/join RPCs below (they make + link the
-- card atomically, RLS-safe via SECURITY DEFINER). Existing members are NOT
-- backfilled here — the app links them lazily the first time they add a photo.
-- Reflected in schema.sql for fresh installs. Idempotent — safe to re-run.

begin;

alter table public.household_members
  add column if not exists person_id uuid references public.people(id) on delete set null;

-- create_household: also create + link the creator's self contact card.
create or replace function public.create_household(household_name text default 'Our Household', member_name text default '')
returns public.household_members language plpgsql security definer set search_path = public as $$
declare h public.households; m public.household_members; pid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  insert into public.households (name, created_by)
  values (coalesce(nullif(household_name, ''), 'Our Household'), auth.uid())
  returning * into h;
  insert into public.household_members (household_id, user_id, display_name, role)
  values (h.id, auth.uid(), coalesce(member_name, ''), 'owner')
  returning * into m;
  -- Self card: named from the display name ('Me' only as a last resort so the
  -- card always has a name). 'shared' so co-members see it and its photo.
  insert into public.people (household_id, name, created_by, privacy_level)
  values (h.id, coalesce(nullif(member_name, ''), 'Me'), auth.uid(), 'shared')
  returning id into pid;
  update public.household_members set person_id = pid where id = m.id returning * into m;
  return m;
end $$;

revoke execute on function public.create_household(text, text) from anon;

-- join_household: first-time joiners get a self card; a re-join keeps theirs
-- (person_id already set), so we never duplicate.
create or replace function public.join_household(code text, name text default '')
returns public.household_members language plpgsql security definer set search_path = public as $$
declare h public.households; m public.household_members; pid uuid;
begin
  select * into h from public.households
   where upper(regexp_replace(join_code, '[^a-zA-Z0-9]', '', 'g'))
       = upper(regexp_replace(code,      '[^a-zA-Z0-9]', '', 'g'));
  if not found then raise exception 'Invalid join code'; end if;
  insert into public.household_members (household_id, user_id, display_name)
  values (h.id, auth.uid(), coalesce(nullif(name,''), ''))
  on conflict (household_id, user_id) do update set display_name = excluded.display_name
  returning * into m;
  if m.person_id is null then
    insert into public.people (household_id, name, created_by, privacy_level)
    values (h.id, coalesce(nullif(name,''), 'Me'), auth.uid(), 'shared')
    returning id into pid;
    update public.household_members set person_id = pid where id = m.id returning * into m;
  end if;
  return m;
end $$;

revoke execute on function public.join_household(text, text) from anon;

commit;
