-- ============================================================
-- 0007_join_code_normalize — forgiving invite-code matching
-- ============================================================
-- join_household() compared the code with a raw `=`, which is case- AND
-- separator-sensitive. Two real ways that breaks an invite:
--   • the default join_code is LOWERCASE hex, but the join input auto-
--     capitalizes on phones → a TYPED code arrives uppercase → no match.
--   • regenerated codes look like "ABC-DEF"; typing "ABCDEF" (no hyphen) misses.
-- Fix: compare on a normalized form (uppercase, letters+digits only) on BOTH
-- sides. The client mirrors this in src/lib/joinCode.js. Safe to re-run.
--
-- Run ONCE against the live project, after 0001_multitenancy.sql.

create or replace function public.join_household(code text, name text default '')
returns public.household_members language plpgsql security definer set search_path = public as $$
declare h public.households; m public.household_members;
begin
  -- households is tiny (one row per tenant), so the un-indexed scan is fine.
  select * into h from public.households
   where upper(regexp_replace(join_code, '[^a-zA-Z0-9]', '', 'g'))
       = upper(regexp_replace(code,      '[^a-zA-Z0-9]', '', 'g'));
  if not found then raise exception 'Invalid join code'; end if;
  insert into public.household_members (household_id, user_id, display_name)
  values (h.id, auth.uid(), coalesce(nullif(name, ''), ''))
  on conflict (household_id, user_id) do update set display_name = excluded.display_name
  returning * into m;
  return m;
end $$;

revoke execute on function public.join_household(text, text) from anon;
