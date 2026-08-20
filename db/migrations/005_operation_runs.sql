CREATE TABLE IF NOT EXISTS operation_runs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  operation TEXT NOT NULL CHECK (operation IN ('sync-all')),
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'partial', 'failed')),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS operation_runs_operation_started_at_idx
  ON operation_runs (operation, started_at DESC);
