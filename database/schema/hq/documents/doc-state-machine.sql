-- Document State Machine
-- DB-level trigger that enforces valid status transitions for all document tables.
-- Run in Supabase SQL Editor after all document tables exist.

-- ── Helper: raise exception for invalid transitions ───────────────────────────

CREATE OR REPLACE FUNCTION check_doc_status_transition(
  table_name  text,
  old_status  text,
  new_status  text,
  allowed     text[][]   -- pairs: [from, to]
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  pair text[];
BEGIN
  IF old_status = new_status THEN RETURN; END IF;
  FOREACH pair SLICE 1 IN ARRAY allowed LOOP
    IF pair[1] = old_status AND pair[2] = new_status THEN RETURN; END IF;
  END LOOP;
  RAISE EXCEPTION 'Invalid % status transition: % → %', table_name, old_status, new_status;
END;
$$;

-- ── SOB (Statement of Billing) ────────────────────────────────────────────────
-- Draft → Sent → Viewed → Partially Paid → Paid
-- any → Cancelled

CREATE OR REPLACE FUNCTION trg_sob_status_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  PERFORM check_doc_status_transition(
    'SOB', OLD.status, NEW.status,
    ARRAY[
      ARRAY['Draft',         'Sent'],
      ARRAY['Sent',          'Viewed'],
      ARRAY['Sent',          'Partially Paid'],
      ARRAY['Sent',          'Paid'],
      ARRAY['Sent',          'Cancelled'],
      ARRAY['Viewed',        'Partially Paid'],
      ARRAY['Viewed',        'Paid'],
      ARRAY['Viewed',        'Cancelled'],
      ARRAY['Partially Paid','Paid'],
      ARRAY['Partially Paid','Cancelled'],
      ARRAY['Draft',         'Cancelled']
    ]
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sob_status_transition ON statements_of_billing;
CREATE TRIGGER sob_status_transition
  BEFORE UPDATE OF status ON statements_of_billing
  FOR EACH ROW EXECUTE FUNCTION trg_sob_status_transition();

-- ── Invoice ───────────────────────────────────────────────────────────────────
-- Draft → Issued → Paid
-- any → Cancelled

CREATE OR REPLACE FUNCTION trg_invoice_status_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  PERFORM check_doc_status_transition(
    'Invoice', OLD.status, NEW.status,
    ARRAY[
      ARRAY['Draft',    'Issued'],
      ARRAY['Draft',    'Cancelled'],
      ARRAY['Issued',   'Paid'],
      ARRAY['Issued',   'Cancelled']
    ]
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoice_status_transition ON invoices;
CREATE TRIGGER invoice_status_transition
  BEFORE UPDATE OF status ON invoices
  FOR EACH ROW EXECUTE FUNCTION trg_invoice_status_transition();

-- ── Bill (Expense Voucher) ────────────────────────────────────────────────────
-- Pending → For Approval → Approved → Paid
-- any → Cancelled

CREATE OR REPLACE FUNCTION trg_bill_status_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  PERFORM check_doc_status_transition(
    'Bill', OLD.status, NEW.status,
    ARRAY[
      ARRAY['Pending',     'For Approval'],
      ARRAY['Pending',     'Cancelled'],
      ARRAY['For Approval','Approved'],
      ARRAY['For Approval','Rejected'],
      ARRAY['For Approval','Cancelled'],
      ARRAY['Approved',    'Paid'],
      ARRAY['Approved',    'Cancelled'],
      ARRAY['Rejected',    'Pending']
    ]
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bill_status_transition ON bills;
CREATE TRIGGER bill_status_transition
  BEFORE UPDATE OF status ON bills
  FOR EACH ROW EXECUTE FUNCTION trg_bill_status_transition();

-- ── Payroll Run ───────────────────────────────────────────────────────────────
-- Draft → Pending → Paid

CREATE OR REPLACE FUNCTION trg_payroll_status_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  PERFORM check_doc_status_transition(
    'Payroll', OLD.status, NEW.status,
    ARRAY[
      ARRAY['Draft',   'Pending'],
      ARRAY['Pending', 'Paid']
    ]
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payroll_status_transition ON payroll_runs;
CREATE TRIGGER payroll_status_transition
  BEFORE UPDATE OF status ON payroll_runs
  FOR EACH ROW EXECUTE FUNCTION trg_payroll_status_transition();

-- ── Purchase Order ────────────────────────────────────────────────────────────
-- Draft → Sent → Approved → Fulfilled
-- any → Cancelled

CREATE OR REPLACE FUNCTION trg_po_status_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  PERFORM check_doc_status_transition(
    'PO', OLD.status, NEW.status,
    ARRAY[
      ARRAY['Draft',    'Sent'],
      ARRAY['Draft',    'Cancelled'],
      ARRAY['Sent',     'Approved'],
      ARRAY['Sent',     'Cancelled'],
      ARRAY['Approved', 'Fulfilled'],
      ARRAY['Approved', 'Cancelled']
    ]
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS po_status_transition ON purchase_orders;
CREATE TRIGGER po_status_transition
  BEFORE UPDATE OF status ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION trg_po_status_transition();

-- ── Contract ──────────────────────────────────────────────────────────────────
-- Draft → Sent → Signed → Active → Completed
-- any → Terminated

CREATE OR REPLACE FUNCTION trg_contract_status_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  PERFORM check_doc_status_transition(
    'Contract', OLD.status, NEW.status,
    ARRAY[
      ARRAY['Draft',     'Sent'],
      ARRAY['Draft',     'Terminated'],
      ARRAY['Sent',      'Signed'],
      ARRAY['Sent',      'Terminated'],
      ARRAY['Signed',    'Active'],
      ARRAY['Signed',    'Terminated'],
      ARRAY['Active',    'Completed'],
      ARRAY['Active',    'Terminated']
    ]
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contract_status_transition ON contracts;
CREATE TRIGGER contract_status_transition
  BEFORE UPDATE OF status ON contracts
  FOR EACH ROW EXECUTE FUNCTION trg_contract_status_transition();

-- ── Quotation (Proposal) ──────────────────────────────────────────────────────
-- Draft → Sent → Won | Lost | Expired

CREATE OR REPLACE FUNCTION trg_proposal_status_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  PERFORM check_doc_status_transition(
    'Quotation', OLD.status, NEW.status,
    ARRAY[
      ARRAY['Draft',   'Sent'],
      ARRAY['Draft',   'Lost'],
      ARRAY['Draft',   'Expired'],
      ARRAY['Sent',    'Won'],
      ARRAY['Sent',    'Lost'],
      ARRAY['Sent',    'Expired']
    ]
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS proposal_status_transition ON proposals;
CREATE TRIGGER proposal_status_transition
  BEFORE UPDATE OF status ON proposals
  FOR EACH ROW EXECUTE FUNCTION trg_proposal_status_transition();
