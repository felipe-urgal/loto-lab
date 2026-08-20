CREATE TABLE IF NOT EXISTS real_bets (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  batch_id BIGINT NOT NULL REFERENCES generated_game_batches(id) ON DELETE RESTRICT,
  lottery TEXT NOT NULL CHECK (lottery IN ('mega-sena', 'lotofacil', 'dia-de-sorte')),
  contest_number INTEGER NOT NULL CHECK (contest_number > 0),
  status TEXT NOT NULL CHECK (status IN ('planned', 'placed', 'awaiting_result', 'checked')),
  actual_cost NUMERIC(18, 2) NOT NULL CHECK (actual_cost >= 0),
  played_at TIMESTAMPTZ NOT NULL,
  checked_at TIMESTAMPTZ,
  total_prize_value NUMERIC(18, 2),
  net_result NUMERIC(18, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT real_bets_batch_contest_unique UNIQUE (batch_id, contest_number)
);

CREATE INDEX IF NOT EXISTS real_bets_lottery_contest_idx
  ON real_bets (lottery, contest_number DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS real_bets_status_idx
  ON real_bets (status, lottery, contest_number);

CREATE TABLE IF NOT EXISTS real_bet_games (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  real_bet_id BIGINT NOT NULL REFERENCES real_bets(id) ON DELETE CASCADE,
  batch_position INTEGER NOT NULL CHECK (batch_position > 0),
  numbers SMALLINT[] NOT NULL,
  fixed_numbers SMALLINT[] NOT NULL,
  variable_numbers SMALLINT[] NOT NULL,
  lucky_month TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  check_result JSONB,
  prize_value NUMERIC(18, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT real_bet_games_bet_position_unique UNIQUE (real_bet_id, batch_position),
  CONSTRAINT real_bet_games_numbers_not_empty CHECK (cardinality(numbers) > 0)
);

CREATE INDEX IF NOT EXISTS real_bet_games_real_bet_id_idx
  ON real_bet_games (real_bet_id, batch_position);
