-- Reliability, immutable strategy versions, async analysis jobs and stronger domain integrity.

CREATE TABLE IF NOT EXISTS strategy_versions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  strategy_id BIGINT NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version > 0),
  methodology_version TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT strategy_versions_strategy_version_unique UNIQUE (strategy_id, version)
);

CREATE INDEX IF NOT EXISTS strategy_versions_strategy_created_at_idx
  ON strategy_versions (strategy_id, version DESC, created_at DESC);

INSERT INTO strategy_versions (strategy_id, version, methodology_version, config)
SELECT strategy.id, 1, strategy.methodology_version, strategy.config
FROM strategies strategy
WHERE NOT EXISTS (
  SELECT 1 FROM strategy_versions version WHERE version.strategy_id = strategy.id
);

ALTER TABLE generated_game_batches
  ADD COLUMN IF NOT EXISTS strategy_version_id BIGINT REFERENCES strategy_versions(id) ON DELETE SET NULL;
ALTER TABLE backtest_runs
  ADD COLUMN IF NOT EXISTS strategy_version_id BIGINT REFERENCES strategy_versions(id) ON DELETE SET NULL;

UPDATE generated_game_batches batch
SET strategy_version_id = version.id
FROM strategy_versions version
WHERE batch.strategy_id = version.strategy_id
  AND batch.strategy_version_id IS NULL
  AND version.version = 1;

UPDATE backtest_runs run
SET strategy_version_id = version.id
FROM strategy_versions version
WHERE run.strategy_id = version.strategy_id
  AND run.strategy_version_id IS NULL
  AND version.version = 1;

CREATE OR REPLACE FUNCTION loto_lab_validate_strategy_reference()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  version_strategy_id BIGINT;
  version_lottery TEXT;
BEGIN
  IF NEW.strategy_version_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT strategy.id, strategy.lottery
  INTO version_strategy_id, version_lottery
  FROM strategy_versions version
  JOIN strategies strategy ON strategy.id = version.strategy_id
  WHERE version.id = NEW.strategy_version_id;

  IF version_strategy_id IS NULL THEN
    RAISE EXCEPTION 'Unknown strategy version %', NEW.strategy_version_id;
  END IF;
  IF NEW.strategy_id IS NOT NULL AND NEW.strategy_id <> version_strategy_id THEN
    RAISE EXCEPTION 'Strategy version % does not belong to strategy %', NEW.strategy_version_id, NEW.strategy_id;
  END IF;
  IF NEW.lottery <> version_lottery THEN
    RAISE EXCEPTION 'Strategy version % belongs to %, not %', NEW.strategy_version_id, version_lottery, NEW.lottery;
  END IF;

  NEW.strategy_id := version_strategy_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS generated_batches_strategy_reference_trigger ON generated_game_batches;
CREATE TRIGGER generated_batches_strategy_reference_trigger
BEFORE INSERT OR UPDATE OF strategy_id, strategy_version_id, lottery ON generated_game_batches
FOR EACH ROW EXECUTE FUNCTION loto_lab_validate_strategy_reference();

DROP TRIGGER IF EXISTS backtest_runs_strategy_reference_trigger ON backtest_runs;
CREATE TRIGGER backtest_runs_strategy_reference_trigger
BEFORE INSERT OR UPDATE OF strategy_id, strategy_version_id, lottery ON backtest_runs
FOR EACH ROW EXECUTE FUNCTION loto_lab_validate_strategy_reference();

CREATE TABLE IF NOT EXISTS analysis_jobs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('backtest', 'strategy-lab')),
  lottery TEXT NOT NULL CHECK (lottery IN ('mega-sena', 'lotofacil', 'dia-de-sorte')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB,
  error JSONB,
  cancel_requested BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  CONSTRAINT analysis_jobs_timestamps_check CHECK (
    (status = 'queued' AND started_at IS NULL AND finished_at IS NULL)
    OR (status = 'running' AND started_at IS NOT NULL AND finished_at IS NULL)
    OR (status IN ('completed', 'failed', 'cancelled') AND finished_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS analysis_jobs_status_created_at_idx
  ON analysis_jobs (status, created_at, id);
CREATE INDEX IF NOT EXISTS analysis_jobs_lottery_created_at_idx
  ON analysis_jobs (lottery, created_at DESC, id DESC);

ALTER TABLE ai_insights ADD COLUMN IF NOT EXISTS evidence_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS ai_insights_evidence_dedupe_idx
  ON ai_insights (lottery, focus, model, evidence_hash)
  WHERE evidence_hash IS NOT NULL;

ALTER TABLE operation_runs DROP CONSTRAINT IF EXISTS operation_runs_status_check;
ALTER TABLE operation_runs ADD CONSTRAINT operation_runs_status_check
  CHECK (status IN ('running', 'success', 'partial', 'failed', 'abandoned'));
ALTER TABLE operation_runs DROP CONSTRAINT IF EXISTS operation_runs_finished_state_check;
ALTER TABLE operation_runs ADD CONSTRAINT operation_runs_finished_state_check CHECK (
  (status = 'running' AND finished_at IS NULL)
  OR (status <> 'running' AND finished_at IS NOT NULL)
);

ALTER TABLE real_bets DROP CONSTRAINT IF EXISTS real_bets_actual_cost_positive_check;
ALTER TABLE real_bets ADD CONSTRAINT real_bets_actual_cost_positive_check CHECK (actual_cost > 0);
ALTER TABLE real_bets DROP CONSTRAINT IF EXISTS real_bets_checked_state_check;
ALTER TABLE real_bets ADD CONSTRAINT real_bets_checked_state_check CHECK (
  (status = 'checked' AND checked_at IS NOT NULL)
  OR (status <> 'checked' AND checked_at IS NULL)
);

ALTER TABLE backtest_runs DROP CONSTRAINT IF EXISTS backtest_runs_financial_coverage_check;
ALTER TABLE backtest_runs ADD CONSTRAINT backtest_runs_financial_coverage_check CHECK (
  financial_coverage IS NULL OR (financial_coverage >= 0 AND financial_coverage <= 1)
);
ALTER TABLE backtest_runs DROP CONSTRAINT IF EXISTS backtest_runs_non_negative_financials_check;
ALTER TABLE backtest_runs ADD CONSTRAINT backtest_runs_non_negative_financials_check CHECK (
  (total_cost IS NULL OR total_cost >= 0)
  AND (financial_cost IS NULL OR financial_cost >= 0)
  AND (total_prize_value IS NULL OR total_prize_value >= 0)
);

CREATE OR REPLACE FUNCTION loto_lab_valid_lucky_month(value TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT value IN (
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  );
$$;

CREATE OR REPLACE FUNCTION loto_lab_validate_game_payload(
  lottery_value TEXT,
  numbers_value SMALLINT[],
  fixed_value SMALLINT[],
  variable_value SMALLINT[],
  lucky_month_value TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  expected_size INTEGER;
  max_number INTEGER;
  fixed_count INTEGER;
BEGIN
  expected_size := CASE lottery_value
    WHEN 'mega-sena' THEN 6
    WHEN 'lotofacil' THEN 15
    WHEN 'dia-de-sorte' THEN 7
    ELSE NULL
  END;
  max_number := CASE lottery_value
    WHEN 'mega-sena' THEN 60
    WHEN 'lotofacil' THEN 25
    WHEN 'dia-de-sorte' THEN 31
    ELSE NULL
  END;

  IF expected_size IS NULL THEN
    RAISE EXCEPTION 'Unknown lottery %', lottery_value;
  END IF;
  IF cardinality(numbers_value) <> expected_size THEN
    RAISE EXCEPTION '% games must contain exactly % numbers', lottery_value, expected_size;
  END IF;
  IF NOT loto_lab_array_unique(numbers_value)
    OR NOT loto_lab_array_unique(fixed_value)
    OR NOT loto_lab_array_unique(variable_value)
    OR NOT loto_lab_array_unique(fixed_value || variable_value) THEN
    RAISE EXCEPTION 'Game numbers and partitions must be unique';
  END IF;
  IF cardinality(numbers_value) <> cardinality(fixed_value) + cardinality(variable_value)
    OR NOT loto_lab_same_members(numbers_value, fixed_value || variable_value) THEN
    RAISE EXCEPTION 'Fixed and variable numbers must partition the game';
  END IF;
  IF NOT loto_lab_array_between(numbers_value, 1, max_number) THEN
    RAISE EXCEPTION '% numbers must be between 1 and %', lottery_value, max_number;
  END IF;

  fixed_count := cardinality(fixed_value);
  IF lottery_value = 'mega-sena' AND fixed_count NOT IN (0, 2, 3) THEN
    RAISE EXCEPTION 'Mega-Sena fixed count must be 0, 2 or 3';
  END IF;
  IF lottery_value = 'lotofacil' AND fixed_count NOT IN (8, 9, 10) THEN
    RAISE EXCEPTION 'Lotofácil fixed count must be 8, 9 or 10';
  END IF;
  IF lottery_value = 'dia-de-sorte' AND fixed_count NOT IN (0, 2, 3) THEN
    RAISE EXCEPTION 'Dia de Sorte fixed count must be 0, 2 or 3';
  END IF;

  IF lottery_value = 'dia-de-sorte' THEN
    IF lucky_month_value IS NULL OR NOT loto_lab_valid_lucky_month(lucky_month_value) THEN
      RAISE EXCEPTION 'Dia de Sorte games require a valid Mês da Sorte';
    END IF;
  ELSIF lucky_month_value IS NOT NULL THEN
    RAISE EXCEPTION '% games cannot contain a Mês da Sorte', lottery_value;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION loto_lab_validate_generated_game()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  parent_lottery TEXT;
BEGIN
  SELECT lottery INTO parent_lottery FROM generated_game_batches WHERE id = NEW.batch_id;
  IF parent_lottery IS NULL THEN RETURN NEW; END IF;
  PERFORM loto_lab_validate_game_payload(
    parent_lottery, NEW.numbers, NEW.fixed_numbers, NEW.variable_numbers, NEW.lucky_month
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS generated_games_domain_integrity_trigger ON generated_games;
CREATE TRIGGER generated_games_domain_integrity_trigger
BEFORE INSERT OR UPDATE OF batch_id, numbers, fixed_numbers, variable_numbers, lucky_month ON generated_games
FOR EACH ROW EXECUTE FUNCTION loto_lab_validate_generated_game();

CREATE OR REPLACE FUNCTION loto_lab_validate_real_bet()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  batch_lottery TEXT;
BEGIN
  SELECT lottery INTO batch_lottery FROM generated_game_batches WHERE id = NEW.batch_id;
  IF batch_lottery IS NOT NULL AND NEW.lottery <> batch_lottery THEN
    RAISE EXCEPTION 'Real bet lottery % does not match batch lottery %', NEW.lottery, batch_lottery;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS real_bets_batch_integrity_trigger ON real_bets;
CREATE TRIGGER real_bets_batch_integrity_trigger
BEFORE INSERT OR UPDATE OF batch_id, lottery ON real_bets
FOR EACH ROW EXECUTE FUNCTION loto_lab_validate_real_bet();

CREATE OR REPLACE FUNCTION loto_lab_validate_real_bet_game()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  bet_lottery TEXT;
  source_batch_id BIGINT;
  source_game generated_games%ROWTYPE;
BEGIN
  SELECT lottery, batch_id INTO bet_lottery, source_batch_id FROM real_bets WHERE id = NEW.real_bet_id;
  IF bet_lottery IS NULL THEN RETURN NEW; END IF;

  PERFORM loto_lab_validate_game_payload(
    bet_lottery, NEW.numbers, NEW.fixed_numbers, NEW.variable_numbers, NEW.lucky_month
  );

  SELECT * INTO source_game
  FROM generated_games
  WHERE batch_id = source_batch_id AND position = NEW.batch_position;

  IF source_game.id IS NULL
    OR NOT loto_lab_same_members(source_game.numbers, NEW.numbers)
    OR NOT loto_lab_same_members(source_game.fixed_numbers, NEW.fixed_numbers)
    OR NOT loto_lab_same_members(source_game.variable_numbers, NEW.variable_numbers)
    OR source_game.lucky_month IS DISTINCT FROM NEW.lucky_month THEN
    RAISE EXCEPTION 'Real-bet game must match the source generated batch position';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS real_bet_games_domain_integrity_trigger ON real_bet_games;
CREATE TRIGGER real_bet_games_domain_integrity_trigger
BEFORE INSERT OR UPDATE OF real_bet_id, batch_position, numbers, fixed_numbers, variable_numbers, lucky_month ON real_bet_games
FOR EACH ROW EXECUTE FUNCTION loto_lab_validate_real_bet_game();
