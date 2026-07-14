-- PayMongo payment tracking
-- Run in Supabase SQL editor after core schema is applied.
-- external_id: PayMongo checkout session ID or link ID
-- reference_id: event_registrations.id or invoices.id (cast as text)

CREATE TABLE IF NOT EXISTS payments (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id  text,
  checkout_url text,
  amount       numeric     NOT NULL,
  currency     text        NOT NULL DEFAULT 'PHP',
  status       text        NOT NULL DEFAULT 'pending',
  type         text        NOT NULL,
  reference_id text,
  metadata     jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Link event registrations and invoices back to payments
ALTER TABLE event_registrations
  ADD COLUMN IF NOT EXISTS payment_id     uuid REFERENCES payments(id),
  ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'pending';

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS payment_id        uuid REFERENCES payments(id),
  ADD COLUMN IF NOT EXISTS payment_url       text,
  ADD COLUMN IF NOT EXISTS paymongo_link_id  text;

-- RLS: admins/finance can read; inserts/updates happen via service role (webhook)
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payments_read_authenticated"
  ON payments FOR SELECT
  TO authenticated
  USING (true);

-- Only service role (webhook) may insert/update payments
-- No INSERT/UPDATE policies needed; service role bypasses RLS.
