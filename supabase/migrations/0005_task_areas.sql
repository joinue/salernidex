-- ============================================================
-- 0005_task_areas — give tasks an optional freeform "area"
-- ============================================================
-- An area is a user-defined category like "Work" or "Personal". It's a third
-- axis, orthogonal to assignee (who) and due date (when): the Tasks page can
-- switch from grouping by due date to grouping by area (see TasksView.jsx).
-- Freeform text rather than a managed table — areas are coined on the fly from
-- TaskForm's datalist of values already in use. null/'' = no area.
--
-- Run ONCE against the live project, AFTER schema.sql. Also reflected in
-- schema.sql now (fresh installs get it), so this is only for older projects.
-- Safe to re-run.

begin;

alter table public.tasks add column if not exists area text;

commit;
