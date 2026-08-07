-- Let a paid payroll run be corrected back to Pending.
--
-- The document state machine (doc-state-machine.sql) made payroll forward-only:
-- Draft → Pending → Paid, with no way back. But payslips get released with the
-- wrong figure, and deleting the run to re-enter it loses the record and its
-- audit trail.
--
-- The Cash Ledger side is already handled: savePayroll reverses the cash-out row
-- when a run leaves Paid, and re-posts it dated correctly if it is paid again.
-- This is what makes that reachable from the form.
--
-- Run this in Supabase -> SQL Editor. Safe to re-run — it replaces the function
-- and the trigger rather than adding to them.

CREATE OR REPLACE FUNCTION trg_payroll_status_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  PERFORM check_doc_status_transition(
    'Payroll', OLD.status, NEW.status,
    ARRAY[
      ARRAY['Draft',   'Pending'],
      ARRAY['Pending', 'Paid'],
      -- Un-pay: correcting a payslip released in error.
      ARRAY['Paid',    'Pending']
    ]
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payroll_status_transition ON payroll_runs;
CREATE TRIGGER payroll_status_transition
  BEFORE UPDATE OF status ON payroll_runs
  FOR EACH ROW EXECUTE FUNCTION trg_payroll_status_transition();
