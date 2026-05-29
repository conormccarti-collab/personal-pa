CREATE TABLE IF NOT EXISTS weekly_plans (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start   date        NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  plan         jsonb       NOT NULL DEFAULT '{}',
  summary      text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (week_start)
);

CREATE INDEX IF NOT EXISTS weekly_plans_week_start_idx ON weekly_plans (week_start DESC);
