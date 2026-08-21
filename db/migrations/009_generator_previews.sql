ALTER TABLE generated_game_batches
  ADD COLUMN IF NOT EXISTS generation_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS generated_game_batches_generation_key_unique
  ON generated_game_batches (generation_key);

CREATE TABLE IF NOT EXISTS generation_previews (
  preview_id TEXT PRIMARY KEY,
  lottery TEXT NOT NULL CHECK (lottery IN ('mega-sena', 'lotofacil', 'dia-de-sorte')),
  seed TEXT NOT NULL,
  target_contest_number INTEGER CHECK (target_contest_number IS NULL OR target_contest_number > 0),
  history_signature TEXT NOT NULL,
  config_signature TEXT NOT NULL,
  game_fingerprint TEXT NOT NULL,
  generator_options JSONB NOT NULL,
  games JSONB NOT NULL,
  plan JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  CONSTRAINT generation_previews_lottery_seed_unique UNIQUE (lottery, seed)
);

CREATE INDEX IF NOT EXISTS generation_previews_expires_at_idx
  ON generation_previews (expires_at);
