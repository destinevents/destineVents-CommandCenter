-- Quotation upgrade: add document-engine columns to proposals + line items table
-- Run in Supabase SQL Editor

ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS quo_number       text,
  ADD COLUMN IF NOT EXISTS client_tin       text,
  ADD COLUMN IF NOT EXISTS business_address text,
  ADD COLUMN IF NOT EXISTS subtotal         numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_amount       numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_amount     numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valid_until      text,
  ADD COLUMN IF NOT EXISTS prepared_by      text,
  ADD COLUMN IF NOT EXISTS notes            text,
  ADD COLUMN IF NOT EXISTS archived_at      timestamptz;

CREATE TABLE IF NOT EXISTS proposal_line_items (
  id          bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  proposal_id bigint NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity    numeric NOT NULL DEFAULT 1,
  unit_price  numeric NOT NULL DEFAULT 0,
  vat_rate    numeric NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposal_line_items_proposal
  ON proposal_line_items (proposal_id);

ALTER TABLE proposal_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage proposal line items"
  ON proposal_line_items FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
