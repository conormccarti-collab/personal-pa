-- Track Claude API token usage for cost visibility
CREATE TABLE IF NOT EXISTS api_usage (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model         text NOT NULL,
  endpoint      text NOT NULL,   -- which feature triggered the call
  input_tokens  int  NOT NULL DEFAULT 0,
  output_tokens int  NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS api_usage_created_at_idx ON api_usage (created_at DESC);
CREATE INDEX IF NOT EXISTS api_usage_endpoint_idx   ON api_usage (endpoint);
