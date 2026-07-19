-- Purchase Orders
-- Run in Supabase SQL Editor after activity-log.sql

CREATE TABLE IF NOT EXISTS purchase_orders (
  id            bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  po_number     text        NOT NULL,                   -- PO-YYYY-NNN
  vendor        text        NOT NULL,
  project_id    bigint      REFERENCES projects(id),
  issue_date    text,
  delivery_date text,
  subtotal      numeric     NOT NULL DEFAULT 0,
  vat_amount    numeric     NOT NULL DEFAULT 0,
  total_amount  numeric     NOT NULL DEFAULT 0,
  status        text        NOT NULL DEFAULT 'Draft',   -- Draft | Sent | Approved | Fulfilled | Cancelled
  notes         text,
  prepared_by   text,
  approved_by   text,
  archived_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_order_line_items (
  id          bigint  PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  po_id       bigint  NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  description text    NOT NULL,
  quantity    numeric NOT NULL DEFAULT 1,
  unit_price  numeric NOT NULL DEFAULT 0,
  vat_rate    numeric NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_project ON purchase_orders (project_id);
CREATE INDEX IF NOT EXISTS idx_po_status  ON purchase_orders (status) WHERE archived_at IS NULL;

ALTER TABLE purchase_orders           ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage purchase orders"
  ON purchase_orders FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can manage PO line items"
  ON purchase_order_line_items FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
