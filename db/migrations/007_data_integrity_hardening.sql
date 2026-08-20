CREATE OR REPLACE FUNCTION loto_lab_array_unique(values_array SMALLINT[])
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT cardinality(values_array) = COUNT(DISTINCT value)
  FROM unnest(values_array) AS value;
$$;

CREATE OR REPLACE FUNCTION loto_lab_array_between(values_array SMALLINT[], min_value INTEGER, max_value INTEGER)
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT COALESCE(BOOL_AND(value BETWEEN min_value AND max_value), FALSE)
  FROM unnest(values_array) AS value;
$$;

CREATE OR REPLACE FUNCTION loto_lab_same_members(left_array SMALLINT[], right_array SMALLINT[])
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT
    ARRAY(SELECT value FROM unnest(left_array) AS value ORDER BY value)
    =
    ARRAY(SELECT value FROM unnest(right_array) AS value ORDER BY value);
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contests_numbers_draw_size_check') THEN
    ALTER TABLE contests ADD CONSTRAINT contests_numbers_draw_size_check CHECK (
      (lottery = 'mega-sena' AND cardinality(numbers) = 6)
      OR (lottery = 'lotofacil' AND cardinality(numbers) = 15)
      OR (lottery = 'dia-de-sorte' AND cardinality(numbers) = 7)
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contests_numbers_unique_check') THEN
    ALTER TABLE contests ADD CONSTRAINT contests_numbers_unique_check CHECK (loto_lab_array_unique(numbers));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contests_numbers_range_check') THEN
    ALTER TABLE contests ADD CONSTRAINT contests_numbers_range_check CHECK (
      (lottery = 'mega-sena' AND loto_lab_array_between(numbers, 1, 60))
      OR (lottery = 'lotofacil' AND loto_lab_array_between(numbers, 1, 25))
      OR (lottery = 'dia-de-sorte' AND loto_lab_array_between(numbers, 1, 31))
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'generated_games_numbers_unique_check') THEN
    ALTER TABLE generated_games ADD CONSTRAINT generated_games_numbers_unique_check CHECK (
      loto_lab_array_unique(numbers)
      AND loto_lab_array_unique(fixed_numbers)
      AND loto_lab_array_unique(variable_numbers)
      AND loto_lab_array_unique(fixed_numbers || variable_numbers)
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'generated_games_partition_check') THEN
    ALTER TABLE generated_games ADD CONSTRAINT generated_games_partition_check CHECK (
      cardinality(numbers) = cardinality(fixed_numbers) + cardinality(variable_numbers)
      AND loto_lab_same_members(numbers, fixed_numbers || variable_numbers)
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'generated_games_numbers_range_check') THEN
    ALTER TABLE generated_games ADD CONSTRAINT generated_games_numbers_range_check CHECK (
      loto_lab_array_between(numbers, 1, 60)
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'real_bet_games_numbers_unique_check') THEN
    ALTER TABLE real_bet_games ADD CONSTRAINT real_bet_games_numbers_unique_check CHECK (
      loto_lab_array_unique(numbers)
      AND loto_lab_array_unique(fixed_numbers)
      AND loto_lab_array_unique(variable_numbers)
      AND loto_lab_array_unique(fixed_numbers || variable_numbers)
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'real_bet_games_partition_check') THEN
    ALTER TABLE real_bet_games ADD CONSTRAINT real_bet_games_partition_check CHECK (
      cardinality(numbers) = cardinality(fixed_numbers) + cardinality(variable_numbers)
      AND loto_lab_same_members(numbers, fixed_numbers || variable_numbers)
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'real_bet_games_numbers_range_check') THEN
    ALTER TABLE real_bet_games ADD CONSTRAINT real_bet_games_numbers_range_check CHECK (
      loto_lab_array_between(numbers, 1, 60)
    );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS real_bets_batch_unique_idx
  ON real_bets (batch_id);
