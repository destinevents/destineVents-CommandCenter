-- 003 Cross-module FK columns
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- All columns are nullable so existing data is unaffected.

-- invoices: track which project or event this invoice came from
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS project_id bigint;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS event_id   bigint;

-- bills: link expense to a partner/vendor record
ALTER TABLE bills ADD COLUMN IF NOT EXISTS partner_id bigint;

-- partners: optional project association
ALTER TABLE partners ADD COLUMN IF NOT EXISTS project_id bigint;

-- impact_entries: link social impact data to the project that generated it
ALTER TABLE impact_entries ADD COLUMN IF NOT EXISTS project_id bigint;

-- documents: context tags (all optional)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS client_id   bigint;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS project_id  bigint;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS proposal_id bigint;
