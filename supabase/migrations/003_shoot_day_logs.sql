-- Time tracking logs for shoot days
CREATE TABLE IF NOT EXISTS shoot_day_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shoot_id    uuid NOT NULL REFERENCES shoots(id) ON DELETE CASCADE,
  date        date NOT NULL DEFAULT CURRENT_DATE,
  start_time  text,          -- "HH:MM" (24h)
  end_time    text,          -- "HH:MM" (24h) — null while running
  breaks      jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{id,label,minutes}]
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shoot_id, date)    -- one log row per shoot per calendar day
);
