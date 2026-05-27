-- ============================================================
-- Fix todo_items section constraint to include 'tomorrow'
-- and remove 'next_two_months' which was replaced by it.
-- Migrates any existing 'next_two_months' rows to 'next_fortnight'.
-- ============================================================

-- 1. Migrate data first (before touching the constraint)
UPDATE todo_items
SET section = 'next_fortnight'
WHERE section = 'next_two_months';

-- 2. Drop the old check constraint
ALTER TABLE todo_items
  DROP CONSTRAINT IF EXISTS todo_items_section_check;

-- 3. Add the updated constraint with 'tomorrow', without 'next_two_months'
ALTER TABLE todo_items
  ADD CONSTRAINT todo_items_section_check
  CHECK (section IN ('today', 'tomorrow', 'next_fortnight'));
