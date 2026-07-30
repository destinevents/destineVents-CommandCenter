-- HQ Projects — add a human-readable Project Code (handout §7)
-- Run this in Supabase -> SQL Editor.
-- Each project gets an editable code (auto-generated as PRJ-YYYY-NNN by the app
-- when left blank). Used on Project Profitability reports and ledger links.

alter table projects add column if not exists code text;
