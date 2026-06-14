-- ============================================================
-- 0017_household_lifecycle — owner succession + clean household delete
-- ============================================================
-- Two gaps in the leave/remove flow:
--
--   1. Owner succession. Removing a member was a bare row delete, so the last
--      owner leaving left the household ownerless — no one could remove/rename
--      members or manage roles ever again. An AFTER DELETE trigger now promotes
--      the longest-standing remaining member whenever a household loses its last
--      owner (whether the owner left or was removed).
--
--   2. Clean delete. Leaving as the *sole* member only deleted the membership
--      row, orphaning the household + all its data behind RLS forever (no one
--      can ever read it again, but it still sits in the DB). delete_household()
--      removes the household row, and the on-delete cascades from 0001 take the
--      members and every data table with it — a real "start over", not a leak.
--
-- Both are SECURITY DEFINER so they can touch roles / cross-table rows past RLS;
-- search_path is pinned. Reflected in schema.sql. Idempotent (create-or-replace
-- + drop-then-create trigger).

begin;

-- 1. Owner succession ----------------------------------------------------------
-- After any member is removed, if the household still exists (i.e. this isn't a
-- cascade from deleting the household itself) and now has members but no owner,
-- promote the longest-standing member. No-op when an owner remains or no members
-- are left.
create or replace function public.promote_owner_on_leave()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Household gone already → this delete is part of a household cascade; skip.
  if not exists (select 1 from public.households where id = old.household_id) then
    return old;
  end if;

  if not exists (
    select 1 from public.household_members
     where household_id = old.household_id and role = 'owner'
  ) then
    update public.household_members
       set role = 'owner'
     where id = (
       select id from public.household_members
        where household_id = old.household_id
        order by joined_at, id
        limit 1
     );
  end if;

  return old;
end $$;

drop trigger if exists household_members_promote_owner on public.household_members;
create trigger household_members_promote_owner
  after delete on public.household_members
  for each row execute function public.promote_owner_on_leave();

-- 2. Clean delete --------------------------------------------------------------
-- Delete a household you are the SOLE member of (the honest "reset / start
-- over"). Guarded to one member so it can't be used to nuke co-members' data —
-- a multi-member household is left via a normal membership row delete instead.
create or replace function public.delete_household(hid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if not public.is_member(hid) then
    raise exception 'Not a member of this household';
  end if;
  select count(*) into n from public.household_members where household_id = hid;
  if n > 1 then
    raise exception 'Household still has other members';
  end if;
  delete from public.households where id = hid;  -- cascades to members + all data
end $$;

revoke execute on function public.delete_household(uuid) from anon;

commit;
