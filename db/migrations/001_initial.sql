CREATE TABLE IF NOT EXISTS contests (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lottery TEXT NOT NULL CHECK (lottery IN ('mega-sena', 'lotofacil', 'dia-de-sorte')),
  contest_number INTEGER NOT NULL CHECK (contest_number > 0),
  draw_date DATE NOT NULL,
  numbers SMALLINT[] NOT NULL,
  lucky_month TEXT,
  amount_collected NUMERIC(16, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT contests_lottery_number_unique UNIQUE (lottery, contest_number),
  CONSTRAINT contests_numbers_not_empty CHECK (cardinality(numbers) > 0)
);

CREATE INDEX IF NOT EXISTS contests_lottery_draw_date_idx
  ON contests (lottery, draw_date DESC);

CREATE TABLE IF NOT EXISTS contest_prize_tiers (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contest_id BIGINT NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  winners INTEGER NOT NULL CHECK (winners >= 0),
  prize_value NUMERIC(16, 2) NOT NULL CHECK (prize_value >= 0),
  CONSTRAINT contest_prize_tiers_unique UNIQUE (contest_id, description)
);

CREATE INDEX IF NOT EXISTS contest_prize_tiers_contest_id_idx
  ON contest_prize_tiers (contest_id);

CREATE TABLE IF NOT EXISTS strategies (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  lottery TEXT NOT NULL CHECK (lottery IN ('mega-sena', 'lotofacil', 'dia-de-sorte')),
  name TEXT NOT NULL,
  methodology_version TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS strategies_lottery_idx
  ON strategies (lottery);

CREATE TABLE IF NOT EXISTS generated_game_batches (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lottery TEXT NOT NULL CHECK (lottery IN ('mega-sena', 'lotofacil', 'dia-de-sorte')),
  strategy_id BIGINT REFERENCES strategies(id) ON DELETE SET NULL,
  target_contest_number INTEGER CHECK (target_contest_number IS NULL OR target_contest_number > 0),
  generator_options JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS generated_game_batches_target_idx
  ON generated_game_batches (lottery, target_contest_number, created_at DESC);

CREATE TABLE IF NOT EXISTS generated_games (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  batch_id BIGINT NOT NULL REFERENCES generated_game_batches(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position > 0),
  numbers SMALLINT[] NOT NULL,
  fixed_numbers SMALLINT[] NOT NULL,
  variable_numbers SMALLINT[] NOT NULL,
  lucky_month TEXT,
  metadata JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT generated_games_batch_position_unique UNIQUE (batch_id, position),
  CONSTRAINT generated_games_numbers_not_empty CHECK (cardinality(numbers) > 0)
);

CREATE INDEX IF NOT EXISTS generated_games_batch_id_idx
  ON generated_games (batch_id);

CREATE TABLE IF NOT EXISTS backtest_runs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lottery TEXT NOT NULL CHECK (lottery IN ('mega-sena', 'lotofacil', 'dia-de-sorte')),
  strategy_id BIGINT REFERENCES strategies(id) ON DELETE SET NULL,
  options JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary JSONB NOT NULL,
  tested_contests INTEGER NOT NULL DEFAULT 0 CHECK (tested_contests >= 0),
  total_games INTEGER NOT NULL DEFAULT 0 CHECK (total_games >= 0),
  total_cost NUMERIC(18, 2),
  financial_cost NUMERIC(18, 2),
  total_prize_value NUMERIC(18, 2),
  roi NUMERIC(18, 8),
  financial_coverage NUMERIC(10, 8),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS backtest_runs_lottery_created_at_idx
  ON backtest_runs (lottery, created_at DESC);

CREATE TABLE IF NOT EXISTS backtest_rounds (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  backtest_run_id BIGINT NOT NULL REFERENCES backtest_runs(id) ON DELETE CASCADE,
  contest_number INTEGER NOT NULL CHECK (contest_number > 0),
  payload JSONB NOT NULL,
  CONSTRAINT backtest_rounds_run_contest_unique UNIQUE (backtest_run_id, contest_number)
);

CREATE INDEX IF NOT EXISTS backtest_rounds_run_id_idx
  ON backtest_rounds (backtest_run_id, contest_number);
