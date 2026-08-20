ALTER TABLE generated_game_batches
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS generated_game_batches_lottery_active_created_at_idx
  ON generated_game_batches (lottery, created_at DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS generated_game_batches_lottery_archived_created_at_idx
  ON generated_game_batches (lottery, archived_at DESC, created_at DESC)
  WHERE archived_at IS NOT NULL;
