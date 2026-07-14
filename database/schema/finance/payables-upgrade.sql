-- Module 3 Payables Upgrade: Extend bills table for full PRD compliance
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New Query)

ALTER TABLE bills
  ADD COLUMN IF NOT EXISTS expense_number text,
  ADD COLUMN IF NOT EXISTS vendor         text,
  ADD COLUMN IF NOT EXISTS project_id     bigint REFERENCES projects(id),
  ADD COLUMN IF NOT EXISTS invoice_number text,
  ADD COLUMN IF NOT EXISTS purchase_order text,
  ADD COLUMN IF NOT EXISTS due_date       text,
  ADD COLUMN IF NOT EXISTS receipt_url    text,
  ADD COLUMN IF NOT EXISTS remarks        text,
  ADD COLUMN IF NOT EXISTS archived_at    timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by    text,
  ADD COLUMN IF NOT EXISTS created_by     text,
  ADD COLUMN IF NOT EXISTS modified_by    text;

-- Migrate legacy statuses to new approval workflow
UPDATE bills SET status = 'Pending' WHERE status = 'Unpaid';

-- Update default to match new workflow
ALTER TABLE bills ALTER COLUMN status SET DEFAULT 'Pending';
