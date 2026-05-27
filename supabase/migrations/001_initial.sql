-- ============================================================
-- Personal PA – complete schema
-- Reflects the actual running state of the Supabase database.
-- All tables are idempotent (IF NOT EXISTS / IF NOT EXISTS cols).
-- No auth yet – user_id is nullable everywhere; RLS is commented
-- out ready to enable once authentication is added.
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";


-- ============================================================
-- profiles  (Know Me / AI context)
-- ============================================================
create table if not exists profiles (
  id           uuid        primary key default uuid_generate_v4(),
  user_id      uuid        unique,                  -- nullable: no auth yet
  name         text        not null default '',
  role         text        not null default '',
  job_spec     text,
  working_style text,
  priorities   text,
  team_context text,
  ai_context   text,                                -- free-form brain dump fed to all AI calls
  updated_at   timestamptz default now()
);


-- ============================================================
-- tasks
-- ============================================================
create table if not exists tasks (
  id               uuid        primary key default uuid_generate_v4(),
  user_id          uuid,                            -- nullable: no auth yet
  title            text        not null,
  description      text,
  priority         text        not null default 'medium'
                               check (priority in ('high', 'medium', 'low')),
  status           text        not null default 'todo'
                               check (status in ('todo', 'in_progress', 'done', 'archived')),
  due_date         date,
  asana_id         text,
  project          text,
  tags             text[]      default '{}',
  category         text,                            -- AI-assigned or manual category
  category_context text,                            -- user's reasoning (signals for AI)
  estimated_hours  float,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

create index if not exists tasks_user_status   on tasks(user_id, status);
create index if not exists tasks_user_priority on tasks(user_id, priority);


-- ============================================================
-- captures  (Universal inbox – text / voice / photo / slack)
-- ============================================================
create table if not exists captures (
  id            uuid        primary key default uuid_generate_v4(),
  user_id       uuid,                               -- nullable: no auth yet
  content       text        not null,
  source        text        not null default 'text'
                            check (source in ('text', 'voice', 'photo', 'slack')),
  raw_image_url text,
  status        text        not null default 'inbox'
                            check (status in ('inbox', 'processed', 'archived')),
  metadata      jsonb       default '{}',
  created_at    timestamptz default now()
);

create index if not exists captures_user_status on captures(user_id, status);


-- ============================================================
-- ideas  (Ideas vault)
-- ============================================================
create table if not exists ideas (
  id               uuid        primary key default uuid_generate_v4(),
  user_id          uuid,                            -- nullable: no auth yet
  title            text        not null,
  content          text        not null,
  tags             text[]      default '{}',
  expanded_content text,
  brief            text,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);


-- ============================================================
-- meetings  (Calendar / today view)
-- ============================================================
create table if not exists meetings (
  id          uuid        primary key default uuid_generate_v4(),
  user_id     uuid,                                 -- nullable: no auth yet
  title       text        not null,
  description text,
  start_time  timestamptz not null,
  end_time    timestamptz,
  location    text,
  attendees   text[]      default '{}',
  created_at  timestamptz default now()
);

create index if not exists meetings_user_start on meetings(user_id, start_time);


-- ============================================================
-- follow_ups
-- ============================================================
create table if not exists follow_ups (
  id          uuid        primary key default uuid_generate_v4(),
  user_id     uuid,                                 -- nullable: no auth yet
  task_id     uuid        references tasks(id) on delete set null,
  description text        not null,
  due_date    date,
  completed   boolean     default false,
  created_at  timestamptz default now()
);

create index if not exists follow_ups_user_due on follow_ups(user_id, due_date);


-- ============================================================
-- team_members
-- ============================================================
create table if not exists team_members (
  id         uuid        primary key default uuid_generate_v4(),
  user_id    uuid,                                  -- nullable: no auth yet
  name       text        not null,
  role       text        not null default '',
  avatar_url text,
  notes      text,
  created_at timestamptz default now()
);


-- ============================================================
-- team_task_assignments  (join table)
-- ============================================================
create table if not exists team_task_assignments (
  id             uuid primary key default uuid_generate_v4(),
  team_member_id uuid references team_members(id) on delete cascade,
  task_id        uuid references tasks(id)        on delete cascade,
  created_at     timestamptz default now(),
  unique(team_member_id, task_id)
);


-- ============================================================
-- todo_items  (Scheduler board – Today / This Week / Month / Long Term)
-- ============================================================
create table if not exists todo_items (
  id               uuid        primary key default uuid_generate_v4(),
  task_id          uuid        references tasks(id) on delete set null,
  title            text        not null,
  section          text        not null default 'today'
                               check (section in ('today', 'next_fortnight', 'next_two_months')),
  sort_order       int         default 0,
  completed        boolean     default false,
  estimated_hours  float,
  -- scheduling fields (calendar board)
  scheduled_time   text,                            -- "HH:MM" – used by Today section
  scheduled_day    int,                             -- 0–6 (Mon–Sun) – used by Next Fortnight section
  duration_minutes int         default 30,          -- Today: actual minutes; Fortnight: day-units × 30
  notes            text,
  color            text,
  idea_id          uuid        references ideas(id) on delete set null,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

create index if not exists todo_items_section on todo_items(section);


-- ============================================================
-- gantt_projects  (Dashboard timeline)
-- ============================================================
create table if not exists gantt_projects (
  id                 uuid        primary key default uuid_generate_v4(),
  asana_project_gid  text        unique,            -- links to Asana project
  name               text        not null,
  start_date         date,
  deadline           date,
  duration_days      int         default 14,
  color              text        default '#7c6af7',
  sort_order         int         default 0,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);


-- ============================================================
-- Row Level Security
-- (Uncomment and configure policies once auth is added)
-- ============================================================
-- alter table profiles             enable row level security;
-- alter table tasks                enable row level security;
-- alter table captures             enable row level security;
-- alter table ideas                enable row level security;
-- alter table meetings             enable row level security;
-- alter table follow_ups           enable row level security;
-- alter table team_members         enable row level security;
-- alter table team_task_assignments enable row level security;
-- alter table todo_items           enable row level security;
-- alter table gantt_projects       enable row level security;
