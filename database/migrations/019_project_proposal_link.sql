-- HQ Projects — remember which proposal a project came from
--
-- QA counter-check, Test 02: the "→ Project" button copies a Won proposal's
-- name, client and value into a new project, but nothing recorded where those
-- values came from. So you could not look at a project and see which quotation
-- won it, nor at a proposal and see what it became.
--
-- Safe to re-run.
--
-- Run this in Supabase -> SQL Editor.

alter table projects
  add column if not exists proposal_id bigint references proposals(id) on delete set null;

-- Finding a project from its proposal is the common lookup; index it.
create index if not exists projects_proposal_id_idx on projects(proposal_id);

comment on column projects.proposal_id is
  'The proposal this project was converted from, when it came via Proposals -> Project.';
