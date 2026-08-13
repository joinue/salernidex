-- ============================================================
-- 0035_join_code_hardening — treat the invite code as a credential
-- ============================================================
-- join_household() adds whoever presents a matching code, with no approval step
-- and no notice to the household. The code IS the credential. Three gaps:
--
--   1. Weak regenerated codes. The column default is 12 hex chars (~48 bits),
--      but the app's regenerate button wrote 6 chars over a 31-char alphabet
--      (~30 bits) drawn from Math.random(). Any household that ever pressed
--      regenerate has been sitting behind a guessable code. The client now
--      writes 12 CSPRNG chars (~59 bits); the backfill at the bottom repairs
--      codes already shortened. Membership rows are untouched — nobody gets
--      kicked out — but a short code that was already shared stops working and
--      has to be re-shared.
--
--   2. No attempt cap. The RPC could be called in a loop at no cost. Failed
--      attempts are now recorded per user and capped at 10 per hour.
--
--   3. A RAISE would defeat (2): aborting the transaction rolls back the very
--      row that records the failure, so the counter could never climb. An
--      invalid code therefore RETURNS NULL rather than raising, which lets the
--      insert commit. The client reads a null result as "bad code" — see
--      src/features/auth/Onboarding.jsx.
--
-- Honest scope: the cap is per authenticated user, and with open signups an
-- attacker can dodge it by making more accounts. It stops noisy scanning; it is
-- not the protection. The entropy in (1) is — 31^12 is not a search anyone
-- finishes. Idempotent, safe to re-run.

begin;

create table if not exists public.join_attempts (
  id           bigserial primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  attempted_at timestamptz not null default now()
);

create index if not exists join_attempts_user_time
  on public.join_attempts (user_id, attempted_at desc);

-- No policies, deliberately: only join_household() below touches this, and as
-- SECURITY DEFINER it runs as the table owner, past RLS. A caller should never
-- be able to read its own strike count, let alone clear it.
alter table public.join_attempts enable row level security;

create or replace function public.join_household(code text, name text default '')
returns public.household_members language plpgsql security definer set search_path = public as $$
declare h public.households; m public.household_members; pid uuid; recent int;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;

  select count(*) into recent from public.join_attempts
   where user_id = auth.uid() and attempted_at > now() - interval '1 hour';
  if recent >= 10 then
    raise exception 'Too many invite-code attempts. Wait an hour and try again.';
  end if;

  -- households is tiny (one row per tenant), so the un-indexed scan is fine.
  select * into h from public.households
   where upper(regexp_replace(join_code, '[^a-zA-Z0-9]', '', 'g'))
       = upper(regexp_replace(code,      '[^a-zA-Z0-9]', '', 'g'));

  -- NULL rather than RAISE, so this strike survives the transaction.
  if not found then
    insert into public.join_attempts (user_id) values (auth.uid());
    return null;
  end if;

  -- A real join clears this user's strikes, and is a good moment to prune
  -- everyone's stale rows (the table is write-mostly and never read in bulk).
  delete from public.join_attempts where user_id = auth.uid();
  delete from public.join_attempts where attempted_at < now() - interval '1 day';

  insert into public.household_members (household_id, user_id, display_name)
  values (h.id, auth.uid(), coalesce(nullif(name,''), ''))
  on conflict (household_id, user_id) do update set display_name = excluded.display_name
  returning * into m;

  -- First-time joiners get a self card (0025); a re-join keeps theirs
  -- (person_id already set), so we never duplicate.
  if m.person_id is null then
    insert into public.people (household_id, name, created_by, privacy_level)
    values (h.id, coalesce(nullif(name,''), 'Me'), auth.uid(), 'shared')
    returning id into pid;
    update public.household_members set person_id = pid where id = m.id returning * into m;
  end if;

  return m;
end $$;

revoke execute on function public.join_household(text, text) from anon;

-- Repair anything the old 6-char generator left behind. Matches the column
-- default's strength. Households still on the default are already 12 chars and
-- are left alone.
update public.households
   set join_code = encode(extensions.gen_random_bytes(6), 'hex')
 where length(regexp_replace(join_code, '[^a-zA-Z0-9]', '', 'g')) < 12;

commit;
