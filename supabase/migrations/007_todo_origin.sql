-- Track where a todo item came from so the board can style them differently
ALTER TABLE todo_items ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'manual';
-- 'manual' = user typed it in, 'asana' = synced from Asana tasks
