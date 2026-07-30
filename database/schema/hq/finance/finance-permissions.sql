-- DestineVents Command Center — Finance Permissions (§9)
-- Run this in Supabase -> SQL Editor AFTER financial-accounts.sql,
-- cash-ledger.sql and founder-capital.sql.
--
-- Replaces the initial "admin_only" policy on the new finance tables with the
-- handout's tiered access model:
--   admin, finance_officer            -> full write (create / edit / delete)
--   supervisor, external_accountant   -> read-only (view dashboards & reports)
--   everyone else                     -> no access
--
-- Existing modules (invoices, bills, payroll, etc.) keep their current policies;
-- this migration only touches the tables added by the Finance integration.

do $$
declare
  t text;
begin
  foreach t in array array['financial_accounts', 'cash_ledger', 'founder_capital']
  loop
    execute format('drop policy if exists "admin_only" on %I', t);
    execute format('drop policy if exists "finance_write" on %I', t);
    execute format('drop policy if exists "finance_read" on %I', t);

    execute format($f$
      create policy "finance_write" on %I for all to authenticated
        using (public.current_user_role() in ('admin', 'finance_officer'))
        with check (public.current_user_role() in ('admin', 'finance_officer'))
    $f$, t);

    execute format($f$
      create policy "finance_read" on %I for select to authenticated
        using (public.current_user_role() in ('admin', 'finance_officer', 'supervisor', 'external_accountant'))
    $f$, t);
  end loop;
end $$;
