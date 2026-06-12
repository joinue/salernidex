-- ============================================================
-- 0001_multitenancy — scope every data table to a household + RLS
-- ============================================================
-- Finalizes the household_id blocks that were left commented in schema.sql.
-- Run ONCE against the live project, AFTER the base schema.sql and the
-- households / household_members / reminder_snoozes tables exist, and deploy
-- the matching app build together (the app now sends household_id on every
-- insert; RLS rejects inserts without it).
--
-- Backfill: existing rows are assigned to the first household. If you have
-- pre-multitenancy data rows but have NOT created a household yet, create one
-- first (sign up + onboarding on the new build, or insert a households row),
-- otherwise the `set not null` steps below fail by design — that failure means
-- "there are orphan rows with nowhere to live", not a bug.
--
-- Idempotency: written to be re-runnable where practical (if exists / if not
-- exists guards). The assignee/completed_by type swaps are one-way.

begin;

-- Helpful preflight: orphan data but no household → stop with a clear message.
do $$
declare have_household boolean; have_data boolean;
begin
  select exists (select 1 from public.households) into have_household;
  select exists (
    select 1 from public.people
    union all select 1 from public.tasks
    union all select 1 from public.lists
    limit 1
  ) into have_data;
  if have_data and not have_household then
    raise exception 'Create a household first (no households row exists but data rows do) — onboarding or an explicit insert into public.households.';
  end if;
end $$;

-- ------------------------------------------------------------
-- 1. household_id on every data table (+ backfill, not null, FK, index)
-- ------------------------------------------------------------
-- families
alter table public.families add column if not exists household_id uuid;
update public.families set household_id = (select id from public.households order by created_at limit 1) where household_id is null;
alter table public.families alter column household_id set not null;
alter table public.families drop constraint if exists families_household_fk;
alter table public.families add constraint families_household_fk foreign key (household_id) references public.households(id) on delete cascade;
create index if not exists families_household_idx on public.families (household_id);

-- people
alter table public.people add column if not exists household_id uuid;
update public.people set household_id = (select id from public.households order by created_at limit 1) where household_id is null;
alter table public.people alter column household_id set not null;
alter table public.people drop constraint if exists people_household_fk;
alter table public.people add constraint people_household_fk foreign key (household_id) references public.households(id) on delete cascade;
create index if not exists people_household_idx on public.people (household_id);

-- key_dates
alter table public.key_dates add column if not exists household_id uuid;
update public.key_dates set household_id = (select id from public.households order by created_at limit 1) where household_id is null;
alter table public.key_dates alter column household_id set not null;
alter table public.key_dates drop constraint if exists key_dates_household_fk;
alter table public.key_dates add constraint key_dates_household_fk foreign key (household_id) references public.households(id) on delete cascade;
create index if not exists key_dates_household_idx on public.key_dates (household_id);

-- organizations
alter table public.organizations add column if not exists household_id uuid;
update public.organizations set household_id = (select id from public.households order by created_at limit 1) where household_id is null;
alter table public.organizations alter column household_id set not null;
alter table public.organizations drop constraint if exists organizations_household_fk;
alter table public.organizations add constraint organizations_household_fk foreign key (household_id) references public.households(id) on delete cascade;
create index if not exists organizations_household_idx on public.organizations (household_id);

-- relationships
alter table public.relationships add column if not exists household_id uuid;
update public.relationships set household_id = (select id from public.households order by created_at limit 1) where household_id is null;
alter table public.relationships alter column household_id set not null;
alter table public.relationships drop constraint if exists relationships_household_fk;
alter table public.relationships add constraint relationships_household_fk foreign key (household_id) references public.households(id) on delete cascade;
create index if not exists relationships_household_idx on public.relationships (household_id);

-- interactions
alter table public.interactions add column if not exists household_id uuid;
update public.interactions set household_id = (select id from public.households order by created_at limit 1) where household_id is null;
alter table public.interactions alter column household_id set not null;
alter table public.interactions drop constraint if exists interactions_household_fk;
alter table public.interactions add constraint interactions_household_fk foreign key (household_id) references public.households(id) on delete cascade;
create index if not exists interactions_household_idx on public.interactions (household_id);

-- groups
alter table public.groups add column if not exists household_id uuid;
update public.groups set household_id = (select id from public.households order by created_at limit 1) where household_id is null;
alter table public.groups alter column household_id set not null;
alter table public.groups drop constraint if exists groups_household_fk;
alter table public.groups add constraint groups_household_fk foreign key (household_id) references public.households(id) on delete cascade;
create index if not exists groups_household_idx on public.groups (household_id);

-- tasks
alter table public.tasks add column if not exists household_id uuid;
update public.tasks set household_id = (select id from public.households order by created_at limit 1) where household_id is null;
alter table public.tasks alter column household_id set not null;
alter table public.tasks drop constraint if exists tasks_household_fk;
alter table public.tasks add constraint tasks_household_fk foreign key (household_id) references public.households(id) on delete cascade;
create index if not exists tasks_household_idx on public.tasks (household_id);

-- task_completions
alter table public.task_completions add column if not exists household_id uuid;
update public.task_completions set household_id = (select id from public.households order by created_at limit 1) where household_id is null;
alter table public.task_completions alter column household_id set not null;
alter table public.task_completions drop constraint if exists task_completions_household_fk;
alter table public.task_completions add constraint task_completions_household_fk foreign key (household_id) references public.households(id) on delete cascade;
create index if not exists task_completions_household_idx on public.task_completions (household_id);

-- task_links
alter table public.task_links add column if not exists household_id uuid;
update public.task_links set household_id = (select id from public.households order by created_at limit 1) where household_id is null;
alter table public.task_links alter column household_id set not null;
alter table public.task_links drop constraint if exists task_links_household_fk;
alter table public.task_links add constraint task_links_household_fk foreign key (household_id) references public.households(id) on delete cascade;
create index if not exists task_links_household_idx on public.task_links (household_id);

-- lists
alter table public.lists add column if not exists household_id uuid;
update public.lists set household_id = (select id from public.households order by created_at limit 1) where household_id is null;
alter table public.lists alter column household_id set not null;
alter table public.lists drop constraint if exists lists_household_fk;
alter table public.lists add constraint lists_household_fk foreign key (household_id) references public.households(id) on delete cascade;
create index if not exists lists_household_idx on public.lists (household_id);

-- list_items
alter table public.list_items add column if not exists household_id uuid;
update public.list_items set household_id = (select id from public.households order by created_at limit 1) where household_id is null;
alter table public.list_items alter column household_id set not null;
alter table public.list_items drop constraint if exists list_items_household_fk;
alter table public.list_items add constraint list_items_household_fk foreign key (household_id) references public.households(id) on delete cascade;
create index if not exists list_items_household_idx on public.list_items (household_id);

-- ------------------------------------------------------------
-- 2. organizations.name: globally-unique → unique per household
--    (two households both having "Lakeside County" must be allowed).
-- ------------------------------------------------------------
alter table public.organizations drop constraint if exists organizations_name_key;
alter table public.organizations drop constraint if exists organizations_household_name_key;
alter table public.organizations add constraint organizations_household_name_key unique (household_id, name);

-- ------------------------------------------------------------
-- 3. Swap the open "authenticated full access" policies for household scoping.
--    The four tables with privacy_level also keep "Private — only me" private
--    at the DB (created_by = auth.uid()); the rest are plain membership checks.
-- ------------------------------------------------------------
-- privacy-aware (people, organizations, tasks, lists)
drop policy if exists "authenticated full access" on public.people;
create policy "household members" on public.people for all to authenticated
  using (public.is_member(household_id) and (privacy_level <> 'marc_only' or created_by = auth.uid()))
  with check (public.is_member(household_id));

drop policy if exists "authenticated full access" on public.organizations;
create policy "household members" on public.organizations for all to authenticated
  using (public.is_member(household_id) and (privacy_level <> 'marc_only' or created_by = auth.uid()))
  with check (public.is_member(household_id));

drop policy if exists "authenticated full access" on public.tasks;
create policy "household members" on public.tasks for all to authenticated
  using (public.is_member(household_id) and (privacy_level <> 'marc_only' or created_by = auth.uid()))
  with check (public.is_member(household_id));

drop policy if exists "authenticated full access" on public.lists;
create policy "household members" on public.lists for all to authenticated
  using (public.is_member(household_id) and (privacy_level <> 'marc_only' or created_by = auth.uid()))
  with check (public.is_member(household_id));

-- membership-only (families, key_dates, relationships, interactions, groups,
-- task_completions, task_links, list_items)
drop policy if exists "authenticated full access" on public.families;
create policy "household members" on public.families for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

drop policy if exists "authenticated full access" on public.key_dates;
create policy "household members" on public.key_dates for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

drop policy if exists "authenticated full access" on public.relationships;
create policy "household members" on public.relationships for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

drop policy if exists "authenticated full access" on public.interactions;
create policy "household members" on public.interactions for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

drop policy if exists "authenticated full access" on public.groups;
create policy "household members" on public.groups for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

drop policy if exists "authenticated full access" on public.task_completions;
create policy "household members" on public.task_completions for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

drop policy if exists "authenticated full access" on public.task_links;
create policy "household members" on public.task_links for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

drop policy if exists "authenticated full access" on public.list_items;
create policy "household members" on public.list_items for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

-- ------------------------------------------------------------
-- 4. assignee / completed_by: label text → household_member uuid FK.
--    Legacy non-uuid values ('anyone', 'me', 'partner', 'either', 'm-1', …)
--    become null (= "Anyone" / unknown). null assignee means "Anyone".
-- ------------------------------------------------------------
alter table public.tasks
  alter column assignee drop default,
  alter column assignee drop not null,
  alter column assignee type uuid using (
    case when assignee ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      then assignee::uuid else null end
  );
alter table public.tasks drop constraint if exists tasks_assignee_fk;
alter table public.tasks add constraint tasks_assignee_fk
  foreign key (assignee) references public.household_members(id) on delete set null;

alter table public.task_completions
  alter column completed_by type uuid using (
    case when completed_by ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      then completed_by::uuid else null end
  );
alter table public.task_completions drop constraint if exists task_completions_by_fk;
alter table public.task_completions add constraint task_completions_by_fk
  foreign key (completed_by) references public.household_members(id) on delete set null;

commit;

-- Optional follow-up (deferred to avoid app churn): rename the privacy_level
-- enum value 'marc_only' → a generic 'private'. The app currently uses
-- 'marc_only' (src/lib/privacy.js) and the policies above match it; rename both
-- together if/when you do it.
