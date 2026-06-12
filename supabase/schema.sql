-- ============================================================
-- SALERNIDEX — Supabase schema
-- Run this in the Supabase SQL Editor (Dashboard -> SQL Editor)
-- ============================================================

-- Privacy enum
create type privacy_level as enum ('marc_only', 'shared', 'family_shared', 'public');

-- ------------------------------------------------------------
-- people
-- ------------------------------------------------------------
create table public.people (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  organization  text,
  role          text,
  email         text,
  phone         text,
  birthday      date,
  address       text,
  tags          text[] not null default '{}',
  privacy_level privacy_level not null default 'shared',
  notes         text,
  deleted_at    timestamptz,                -- soft delete: null = active
  created_by    uuid default auth.uid(),
  updated_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ------------------------------------------------------------
-- organizations
-- ------------------------------------------------------------
create table public.organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  type          text,                       -- Company, Government, Nonprofit, Community
  description   text,
  key_contacts  text[] not null default '{}',
  tags          text[] not null default '{}',
  privacy_level privacy_level not null default 'shared',
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ------------------------------------------------------------
-- relationships
-- ------------------------------------------------------------
create table public.relationships (
  id                uuid primary key default gen_random_uuid(),
  person_a_id       uuid not null references public.people(id) on delete cascade,
  person_b_id       uuid not null references public.people(id) on delete cascade,
  relationship_type text not null default 'knows',  -- knows, works_with, connected_to, reports_to
  notes             text,
  created_by        uuid default auth.uid(),
  created_at        timestamptz not null default now(),
  constraint no_self_relationship check (person_a_id <> person_b_id)
);

-- ------------------------------------------------------------
-- groups (smart groups: membership = tag logic AND / OR / NOT)
-- ------------------------------------------------------------
create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  all_tags    text[] not null default '{}',   -- person must have ALL of these
  any_tags    text[] not null default '{}',   -- ...and at least ONE of these (if any listed)
  none_tags   text[] not null default '{}',   -- ...and NONE of these
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- audit_log
-- ------------------------------------------------------------
create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid,
  action      text not null,                -- created, updated, deleted
  table_name  text not null,
  record_id   uuid,
  changes     jsonb,
  "timestamp" timestamptz not null default now()
);

-- ------------------------------------------------------------
-- updated_at maintenance
-- ------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  if to_jsonb(new) ? 'updated_by' then
    new.updated_by = auth.uid();
  end if;
  return new;
end $$;

create trigger people_touch before update on public.people
  for each row execute function public.touch_updated_at();
create trigger organizations_touch before update on public.organizations
  for each row execute function public.touch_updated_at();
create trigger groups_touch before update on public.groups
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------
-- audit trigger
-- ------------------------------------------------------------
create or replace function public.write_audit()
returns trigger language plpgsql security definer as $$
begin
  insert into public.audit_log (user_id, action, table_name, record_id, changes)
  values (
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    coalesce(new.id, old.id),
    case tg_op
      when 'INSERT' then to_jsonb(new)
      when 'UPDATE' then jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new))
      when 'DELETE' then to_jsonb(old)
    end
  );
  return coalesce(new, old);
end $$;

create trigger people_audit after insert or update or delete on public.people
  for each row execute function public.write_audit();
create trigger organizations_audit after insert or update or delete on public.organizations
  for each row execute function public.write_audit();
create trigger relationships_audit after insert or update or delete on public.relationships
  for each row execute function public.write_audit();
create trigger groups_audit after insert or update or delete on public.groups
  for each row execute function public.write_audit();

-- ------------------------------------------------------------
-- Row Level Security
-- Single shared account model: any authenticated user has full
-- access. privacy_level filtering happens in the app UI.
-- ------------------------------------------------------------
alter table public.people enable row level security;
alter table public.organizations enable row level security;
alter table public.relationships enable row level security;
alter table public.groups enable row level security;
alter table public.audit_log enable row level security;

create policy "authenticated full access" on public.people
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.organizations
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.relationships
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.groups
  for all to authenticated using (true) with check (true);
create policy "authenticated read audit" on public.audit_log
  for select to authenticated using (true);

-- ------------------------------------------------------------
-- Helpful indexes for search
-- ------------------------------------------------------------
create index people_name_idx on public.people using gin (to_tsvector('simple', name));
create index people_tags_idx on public.people using gin (tags);
create index relationships_a_idx on public.relationships (person_a_id);
create index relationships_b_idx on public.relationships (person_b_id);

-- ------------------------------------------------------------
-- Realtime (so edits sync live across devices)
-- ------------------------------------------------------------
alter publication supabase_realtime add table public.people;
alter publication supabase_realtime add table public.organizations;
alter publication supabase_realtime add table public.relationships;
alter publication supabase_realtime add table public.groups;
