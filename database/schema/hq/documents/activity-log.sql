-- Document Activity Log
-- Tracks every meaningful action on any document type across HQ.
-- Run in Supabase SQL Editor after the initial schema migrations.

CREATE TABLE IF NOT EXISTS document_activity_logs (
  id           bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  doc_type     text        NOT NULL,  -- 'sob' | 'invoice' | 'bill' | 'payroll' | 'po' | 'quotation' | 'contract'
  doc_id       bigint      NOT NULL,
  doc_number   text,                  -- human-readable number e.g. "SOB-2026-001"
  action       text        NOT NULL,  -- 'created' | 'sent' | 'approved' | 'rejected' | 'paid' | 'downloaded' | 'archived' | 'cancelled'
  performed_by text,                  -- display name of the user who triggered the action
  notes        text,                  -- optional freeform context
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Index for fast per-document lookups (shown in activity feed)
CREATE INDEX IF NOT EXISTS idx_doc_activity_doc ON document_activity_logs (doc_type, doc_id);

-- Index for user-level activity audits
CREATE INDEX IF NOT EXISTS idx_doc_activity_user ON document_activity_logs (performed_by, created_at DESC);

-- Row Level Security
ALTER TABLE document_activity_logs ENABLE ROW LEVEL SECURITY;

-- Only authenticated users of the same account can read logs
CREATE POLICY "Authenticated users can read activity logs"
  ON document_activity_logs FOR SELECT
  USING (auth.role() = 'authenticated');

-- Insert allowed for authenticated users (service role for server-side writes)
CREATE POLICY "Authenticated users can insert activity logs"
  ON document_activity_logs FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- No update or delete — logs are immutable
