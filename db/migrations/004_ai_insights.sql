CREATE TABLE IF NOT EXISTS ai_insights (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lottery TEXT NOT NULL CHECK (lottery IN ('mega-sena', 'lotofacil', 'dia-de-sorte')),
  focus TEXT NOT NULL CHECK (focus IN ('overview', 'analysis', 'strategy', 'real-performance')),
  model TEXT NOT NULL,
  provider_response_id TEXT,
  evidence JSONB NOT NULL,
  insight JSONB NOT NULL,
  usage JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_insights_lottery_created_at_idx
  ON ai_insights (lottery, created_at DESC);
