-- Contracts
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS contracts (
  id            bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  con_number    text        NOT NULL,               -- CON-YYYY-NNN
  client        text        NOT NULL,
  project_id    bigint      REFERENCES projects(id),
  title         text        NOT NULL,
  contract_date text,
  start_date    text,
  end_date      text,
  value         numeric     NOT NULL DEFAULT 0,
  status        text        NOT NULL DEFAULT 'Draft', -- Draft | Sent | Signed | Active | Completed | Terminated
  terms         text,
  prepared_by   text,
  signed_by     text,
  signed_at     text,
  archived_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contracts_status    ON contracts (status) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contracts_project   ON contracts (project_id);

ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage contracts"
  ON contracts FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
