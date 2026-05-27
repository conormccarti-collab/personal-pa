-- Add parent task fields so Asana sub-tasks can reference their parent
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS parent_asana_id   text,
  ADD COLUMN IF NOT EXISTS parent_task_title text;
