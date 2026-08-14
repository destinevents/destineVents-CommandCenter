-- Invoices — default new rows to 'Draft', not the legacy 'Unpaid'
--
-- QA counter-check, Test 04. 'Unpaid' predates the Draft -> Issued -> Paid
-- lifecycle, and doc-state-machine.sql has no transition out of it, so any
-- invoice landing on that status could never reach Paid.
--
-- Checked in Supabase on 14 Aug 2026 via database/ops/check-stuck-unpaid-
-- invoices.sql: every invoice was already on 'Draft' (3 rows, PHP 7,000) and
-- none were stuck. So this only closes the door — there is no data to migrate.
--
-- Safe to re-run.
--
-- Run this in Supabase -> SQL Editor.

alter table invoices alter column status set default 'Draft';
