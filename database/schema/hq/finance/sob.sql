-- Statement of Billing (SOB) + invoice quick-fix columns
-- Run in Supabase SQL Editor after invoice-line-items.sql

-- ── Invoice new columns (Module 2 quick fixes) ────────────────────────────────
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS tin              text,
  ADD COLUMN IF NOT EXISTS business_address text,
  ADD COLUMN IF NOT EXISTS archived_at      timestamptz;

-- ── Statement of Billing table ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS statements_of_billing (
  id                   bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  sob_num              text        NOT NULL,
  client               text,
  project_id           bigint      REFERENCES projects(id),
  issue_date           text,
  due_date             text,
  currency             text        DEFAULT 'PHP',
  description          text,
  subtotal             numeric     DEFAULT 0,
  discount             numeric     DEFAULT 0,
  vat_amount           numeric     DEFAULT 0,
  total_amount         numeric     DEFAULT 0,
  payment_instructions text,
  notes                text,
  prepared_by          text,
  approved_by          text,
  status               text        DEFAULT 'Draft',
  linked_invoice_id    bigint      REFERENCES invoices(id),
  archived_at          timestamptz,
  created_at           timestamptz DEFAULT now()
);

-- ── SOB line items table ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sob_line_items (
  id          bigint  PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  sob_id      bigint  NOT NULL REFERENCES statements_of_billing(id) ON DELETE CASCADE,
  description text    NOT NULL,
  quantity    numeric NOT NULL DEFAULT 1,
  unit_price  numeric NOT NULL DEFAULT 0,
  vat_rate    numeric NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE statements_of_billing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sob_authenticated"
  ON statements_of_billing FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE sob_line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sob_line_items_authenticated"
  ON sob_line_items FOR ALL
  TO authenticated USING (true) WITH CHECK (true);
