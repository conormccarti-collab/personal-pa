export type Priority = 'high' | 'medium' | 'low'
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'archived'
export type CaptureSource = 'text' | 'voice' | 'photo' | 'slack'
export type CaptureStatus = 'inbox' | 'processed' | 'archived'

export interface Task {
  id: string
  user_id: string
  title: string
  description: string | null
  priority: Priority
  status: TaskStatus
  due_date: string | null
  asana_id: string | null
  project: string | null
  tags: string[]
  category: string | null
  category_context: string | null
  estimated_hours: number | null
  breakdown_steps: string[]
  parent_asana_id: string | null
  parent_task_title: string | null
  created_at: string
  updated_at: string
}

export type TodoSection = 'today' | 'tomorrow' | 'next_fortnight'

export interface TodoItem {
  id: string
  task_id: string | null
  idea_id: string | null
  title: string
  section: TodoSection
  sort_order: number
  completed: boolean
  estimated_hours: number | null
  scheduled_time: string | null   // "HH:MM" for Today items
  scheduled_day: number | null    // 0-6 (Mon-Sun) for Next Fortnight items
  duration_minutes: number        // Today: actual minutes; Fortnight: day-units × 30
  notes: string | null
  color: string | null
  origin: 'manual' | 'asana'
  created_at: string
  updated_at: string
}

export interface Capture {
  id: string
  user_id: string
  content: string
  source: CaptureSource
  raw_image_url: string | null
  status: CaptureStatus
  metadata: Record<string, unknown>
  created_at: string
}

export interface Idea {
  id: string
  user_id: string
  title: string
  content: string
  tags: string[]
  expanded_content: string | null
  brief: string | null
  created_at: string
  updated_at: string
}

export interface Meeting {
  id: string
  user_id: string
  title: string
  description: string | null
  start_time: string
  end_time: string | null
  location: string | null
  attendees: string[]
  created_at: string
}

export interface FollowUp {
  id: string
  user_id: string
  task_id: string | null
  description: string
  due_date: string | null
  completed: boolean
  created_at: string
}

export interface TeamMember {
  id: string
  user_id: string
  name: string
  role: string
  avatar_url: string | null
  workload: Task[]
  notes: string | null
  created_at: string
}

export interface Profile {
  id: string
  user_id: string
  name: string
  role: string
  job_spec: string | null
  working_style: string | null
  priorities: string | null
  team_context: string | null
  ai_context: string | null
  updated_at: string
}

export interface GanttProject {
  id: string
  asana_project_gid: string | null
  name: string
  start_date: string | null
  deadline: string | null
  duration_days: number
  color: string
  sort_order: number
  created_at: string
  updated_at: string
}

// ─── Content calendar ─────────────────────────────────────────────────────────

export type ContentStatus =
  | 'idea' | 'scripting' | 'filming' | 'editing'
  | 'scheduled' | 'published' | 'cancelled'

export type ContentPlatform =
  | 'youtube' | 'instagram_reels' | 'tiktok' | 'instagram_post' | 'other'

export interface Brand {
  id: string
  user_id: string | null
  name: string
  color: string   // hex e.g. "#1a91ff"
  created_at: string
}

export interface ContentItem {
  id: string
  user_id: string | null
  title: string
  platform: ContentPlatform
  brand_id: string | null
  status: ContentStatus
  shoot_date: string | null    // YYYY-MM-DD
  edit_date: string | null     // YYYY-MM-DD
  publish_date: string | null  // YYYY-MM-DD — primary calendar date
  notes: string | null
  created_at: string
  updated_at: string
}

// ─── Shoot Planner ────────────────────────────────────────────────────────────

export type ShootType = 'photo' | 'video' | 'mixed'
export type ShootStatus = 'planning' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled'
export type ShotStatus = 'pending' | 'in_progress' | 'done'
export type EquipmentCategory =
  | 'camera_body'
  | 'lens'
  | 'lighting'
  | 'audio'
  | 'tripod'
  | 'accessory'
  | 'other'

export interface Shoot {
  id: string
  user_id: string | null
  title: string
  client: string | null
  brief: string | null
  deliverables: string | null
  shoot_type: ShootType
  status: ShootStatus
  start_date: string        // YYYY-MM-DD
  end_date: string | null   // YYYY-MM-DD
  location: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface ShotListItem {
  id: string
  shoot_id: string
  title: string
  description: string | null
  lens: string | null
  lighting_notes: string | null
  camera_notes: string | null
  status: ShotStatus
  sort_order: number
  created_at: string
}

export interface EquipmentItem {
  id: string
  shoot_id: string
  name: string
  category: EquipmentCategory
  packed: boolean
  sort_order: number
  created_at: string
}

// ─── Daily briefing ───────────────────────────────────────────────────────────

export interface DailyBriefing {
  greeting: string
  summary: string
  focus: string
  top_tasks: Task[]
  upcoming_meetings: Meeting[]
  follow_ups: FollowUp[]
}
