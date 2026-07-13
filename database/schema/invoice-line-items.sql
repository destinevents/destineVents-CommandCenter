-- Invoice line items + payment recording fields
-- Run in Supabase SQL Editor after supabase-setup.sql and cross-module-links.sql.

CREATE TABLE IF NOT EXISTS invoice_line_items (
  id          bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  invoice_id  bigint      NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description text        NOT NULL,
  quantity    numeric     NOT NULL DEFAULT 1,
  unit_price  numeric     NOT NULL DEFAULT 0,
  vat_rate    numeric     NOT NULL DEFAULT 0,  -- 0 or 12 (percent)
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS subtotal          numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_amount        numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount          numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes             text,
  ADD COLUMN IF NOT EXISTS payment_method    text,
  ADD COLUMN IF NOT EXISTS payment_reference text,
  ADD COLUMN IF NOT EXISTS payment_date      text,
  ADD COLUMN IF NOT EXISTS received_by       text;

-- RLS: same access as invoices (authenticated users read; mutations via app)
ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoice_line_items_authenticated"
  ON invoice_line_items FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
