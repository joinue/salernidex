-- 0003: let Groups be linked to tasks/projects, alongside people & orgs.
--
-- task_links is polymorphic (entity_type picks the table, entity_id the row).
-- It already carries household_id and is covered by the "household members"
-- RLS policy from 0001, so widening the allowed entity_type is the whole
-- change — no new policy, column, or index needed.

alter table public.task_links drop constraint if exists task_links_entity_type_chk;
alter table public.task_links add constraint task_links_entity_type_chk
  check (entity_type in ('person', 'organization', 'group'));
