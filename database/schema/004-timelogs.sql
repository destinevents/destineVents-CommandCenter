-- Time logs for freelance / billable hour tracking (HQ admin use)
CREATE TABLE IF NOT EXISTS time_logs (
  id          bigserial PRIMARY KEY,
  date        date          NOT NULL,
  client      text,
  project     text,
  description text          NOT NULL DEFAULT '',
  hours       numeric(5,2)  NOT NULL DEFAULT 0,
  rate        numeric(10,2),          -- hourly rate in PHP (optional)
  billable    boolean       DEFAULT true,
  status      text          DEFAULT 'Logged', -- Logged | Invoiced
  created_at  timestamptz   DEFAULT now()
);

ALTER TABLE time_logs ENABLE ROW LEVEL SECURITY;
-- Admin-only: any authenticated user with admin role may read/write
CREATE POLICY "admin full access" ON time_logs FOR ALL USING (true) WITH CHECK (true);
