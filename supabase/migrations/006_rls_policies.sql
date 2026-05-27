-- ============================================================
-- Row Level Security — personal single-user app
--
-- Enables RLS on every table (silences Supabase security advisor)
-- and adds a permissive "allow all" policy on each one.
--
-- This is correct for a personal app with no multi-user auth.
-- When Supabase Auth is added later, swap USING (true) for
-- USING (auth.uid() = user_id) on each table.
-- ============================================================

-- ── profiles ────────────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON profiles;
CREATE POLICY "allow_all" ON profiles USING (true) WITH CHECK (true);

-- ── tasks ───────────────────────────────────────────────────
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON tasks;
CREATE POLICY "allow_all" ON tasks USING (true) WITH CHECK (true);

-- ── captures ────────────────────────────────────────────────
ALTER TABLE captures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON captures;
CREATE POLICY "allow_all" ON captures USING (true) WITH CHECK (true);

-- ── ideas ───────────────────────────────────────────────────
ALTER TABLE ideas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON ideas;
CREATE POLICY "allow_all" ON ideas USING (true) WITH CHECK (true);

-- ── meetings ────────────────────────────────────────────────
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON meetings;
CREATE POLICY "allow_all" ON meetings USING (true) WITH CHECK (true);

-- ── follow_ups ──────────────────────────────────────────────
ALTER TABLE follow_ups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON follow_ups;
CREATE POLICY "allow_all" ON follow_ups USING (true) WITH CHECK (true);

-- ── team_members ────────────────────────────────────────────
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON team_members;
CREATE POLICY "allow_all" ON team_members USING (true) WITH CHECK (true);

-- ── team_task_assignments ───────────────────────────────────
ALTER TABLE team_task_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON team_task_assignments;
CREATE POLICY "allow_all" ON team_task_assignments USING (true) WITH CHECK (true);

-- ── todo_items ──────────────────────────────────────────────
ALTER TABLE todo_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON todo_items;
CREATE POLICY "allow_all" ON todo_items USING (true) WITH CHECK (true);

-- ── gantt_projects ──────────────────────────────────────────
ALTER TABLE gantt_projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON gantt_projects;
CREATE POLICY "allow_all" ON gantt_projects USING (true) WITH CHECK (true);

-- ── shoots ──────────────────────────────────────────────────
ALTER TABLE shoots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON shoots;
CREATE POLICY "allow_all" ON shoots USING (true) WITH CHECK (true);

-- ── shot_list_items ─────────────────────────────────────────
ALTER TABLE shot_list_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON shot_list_items;
CREATE POLICY "allow_all" ON shot_list_items USING (true) WITH CHECK (true);

-- ── equipment_items ─────────────────────────────────────────
ALTER TABLE equipment_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON equipment_items;
CREATE POLICY "allow_all" ON equipment_items USING (true) WITH CHECK (true);

-- ── brands ──────────────────────────────────────────────────
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON brands;
CREATE POLICY "allow_all" ON brands USING (true) WITH CHECK (true);

-- ── content_items ───────────────────────────────────────────
ALTER TABLE content_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON content_items;
CREATE POLICY "allow_all" ON content_items USING (true) WITH CHECK (true);

-- ── shoot_day_logs ──────────────────────────────────────────
ALTER TABLE shoot_day_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON shoot_day_logs;
CREATE POLICY "allow_all" ON shoot_day_logs USING (true) WITH CHECK (true);

-- ── notifications ───────────────────────────────────────────
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON notifications;
CREATE POLICY "allow_all" ON notifications USING (true) WITH CHECK (true);
