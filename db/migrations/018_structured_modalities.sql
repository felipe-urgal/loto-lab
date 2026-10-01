DO $$
DECLARE
  table_name TEXT;
  constraint_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'contests',
    'strategies',
    'generated_game_batches',
    'backtest_runs',
    'real_bets',
    'ai_insights',
    'lottery_agenda',
    'generation_previews'
  ]
  LOOP
    IF to_regclass(format('public.%I', table_name)) IS NULL THEN
      CONTINUE;
    END IF;
    constraint_name := table_name || '_lottery_check';
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', table_name, constraint_name);
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I CHECK (lottery IN (''mega-sena'', ''lotofacil'', ''dia-de-sorte'', ''quina'', ''lotomania'', ''dupla-sena'', ''mais-milionaria'', ''timemania'', ''super-sete''))',
      table_name,
      constraint_name
    );
  END LOOP;
END $$;

DO $$
BEGIN
  IF to_regclass('public.notifications') IS NOT NULL THEN
    ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_lottery_check;
    ALTER TABLE notifications ADD CONSTRAINT notifications_lottery_check
      CHECK (lottery IS NULL OR lottery IN (
        'mega-sena', 'lotofacil', 'dia-de-sorte', 'quina', 'lotomania',
        'dupla-sena', 'mais-milionaria', 'timemania', 'super-sete'
      ));
  END IF;

  IF to_regclass('public.research_hypotheses') IS NOT NULL THEN
    ALTER TABLE research_hypotheses DROP CONSTRAINT IF EXISTS research_hypotheses_lottery_check;
    ALTER TABLE research_hypotheses ADD CONSTRAINT research_hypotheses_lottery_check
      CHECK (lottery IS NULL OR lottery IN (
        'mega-sena', 'lotofacil', 'dia-de-sorte', 'quina', 'lotomania',
        'dupla-sena', 'mais-milionaria', 'timemania', 'super-sete'
      ));
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.contests') IS NOT NULL THEN
    ALTER TABLE contests ADD COLUMN IF NOT EXISTS secondary_selection JSONB;
    ALTER TABLE contests ADD COLUMN IF NOT EXISTS columns SMALLINT[];

    UPDATE contests
      SET secondary_selection = jsonb_build_object(
        'kind', 'lucky-month',
        'values', jsonb_build_array(lucky_month)
      )
      WHERE lottery = 'dia-de-sorte'
        AND lucky_month IS NOT NULL
        AND secondary_selection IS NULL;

    ALTER TABLE contests DROP CONSTRAINT IF EXISTS contests_numbers_draw_size_check;
    ALTER TABLE contests ADD CONSTRAINT contests_numbers_draw_size_check CHECK (
      (lottery = 'mega-sena' AND cardinality(numbers) = 6)
      OR (lottery = 'lotofacil' AND cardinality(numbers) = 15)
      OR (lottery = 'dia-de-sorte' AND cardinality(numbers) = 7)
      OR (lottery = 'quina' AND cardinality(numbers) = 5)
      OR (lottery = 'lotomania' AND cardinality(numbers) = 20)
      OR (lottery = 'dupla-sena' AND cardinality(numbers) = 6)
      OR (lottery = 'mais-milionaria' AND cardinality(numbers) = 6)
      OR (lottery = 'timemania' AND cardinality(numbers) = 7)
      OR (lottery = 'super-sete' AND cardinality(numbers) = 7)
    );

    ALTER TABLE contests DROP CONSTRAINT IF EXISTS contests_numbers_unique_check;
    ALTER TABLE contests ADD CONSTRAINT contests_numbers_unique_check CHECK (
      lottery = 'super-sete' OR loto_lab_array_unique(numbers)
    );

    ALTER TABLE contests DROP CONSTRAINT IF EXISTS contests_numbers_range_check;
    ALTER TABLE contests ADD CONSTRAINT contests_numbers_range_check CHECK (
      (lottery = 'mega-sena' AND loto_lab_array_between(numbers, 1, 60))
      OR (lottery = 'lotofacil' AND loto_lab_array_between(numbers, 1, 25))
      OR (lottery = 'dia-de-sorte' AND loto_lab_array_between(numbers, 1, 31))
      OR (lottery = 'quina' AND loto_lab_array_between(numbers, 1, 80))
      OR (lottery = 'lotomania' AND loto_lab_array_between(numbers, 0, 99))
      OR (lottery = 'dupla-sena' AND loto_lab_array_between(numbers, 1, 50))
      OR (lottery = 'mais-milionaria' AND loto_lab_array_between(numbers, 1, 50))
      OR (lottery = 'timemania' AND loto_lab_array_between(numbers, 1, 80))
      OR (lottery = 'super-sete' AND loto_lab_array_between(numbers, 0, 9))
    );

    ALTER TABLE contests DROP CONSTRAINT IF EXISTS contests_structured_result_check;
    ALTER TABLE contests ADD CONSTRAINT contests_structured_result_check CHECK (
      (lottery = 'dia-de-sorte' AND secondary_selection->>'kind' = 'lucky-month')
      OR (lottery = 'mais-milionaria'
          AND secondary_selection->>'kind' = 'clovers'
          AND jsonb_array_length(secondary_selection->'values') = 2)
      OR (lottery = 'timemania'
          AND secondary_selection->>'kind' = 'favorite-team'
          AND jsonb_array_length(secondary_selection->'values') = 1)
      OR (lottery = 'super-sete'
          AND columns IS NOT NULL
          AND cardinality(columns) = 7
          AND loto_lab_array_between(columns, 0, 9))
      OR (lottery NOT IN ('dia-de-sorte', 'mais-milionaria', 'timemania', 'super-sete')
          AND secondary_selection IS NULL
          AND columns IS NULL)
    );
  END IF;

  IF to_regclass('public.generated_games') IS NOT NULL THEN
    ALTER TABLE generated_games ADD COLUMN IF NOT EXISTS secondary_selection JSONB;
    ALTER TABLE generated_games ADD COLUMN IF NOT EXISTS columns JSONB;

    UPDATE generated_games
      SET secondary_selection = jsonb_build_object(
        'kind', 'lucky-month',
        'values', jsonb_build_array(lucky_month)
      )
      WHERE lucky_month IS NOT NULL
        AND secondary_selection IS NULL;

    ALTER TABLE generated_games DROP CONSTRAINT IF EXISTS generated_games_columns_check;
    ALTER TABLE generated_games ADD CONSTRAINT generated_games_columns_check CHECK (
      columns IS NULL OR (
        jsonb_typeof(columns) = 'array'
        AND jsonb_array_length(columns) = 7
      )
    );
  END IF;
END $$;

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
  min_size INTEGER;
  max_size INTEGER;
  min_number INTEGER;
  max_number INTEGER;
  fixed_count INTEGER;
BEGIN
  min_size := CASE lottery_value
    WHEN 'mega-sena' THEN 6
    WHEN 'lotofacil' THEN 15
    WHEN 'dia-de-sorte' THEN 7
    WHEN 'quina' THEN 5
    WHEN 'lotomania' THEN 50
    WHEN 'dupla-sena' THEN 6
    WHEN 'mais-milionaria' THEN 6
    WHEN 'timemania' THEN 10
    WHEN 'super-sete' THEN 0
    ELSE NULL
  END;
  max_size := CASE lottery_value
    WHEN 'mega-sena' THEN 20
    WHEN 'lotofacil' THEN 20
    WHEN 'dia-de-sorte' THEN 7
    WHEN 'quina' THEN 15
    WHEN 'lotomania' THEN 50
    WHEN 'dupla-sena' THEN 15
    WHEN 'mais-milionaria' THEN 6
    WHEN 'timemania' THEN 10
    WHEN 'super-sete' THEN 0
    ELSE NULL
  END;
  min_number := CASE lottery_value
    WHEN 'lotomania' THEN 0
    WHEN 'super-sete' THEN 0
    ELSE 1
  END;
  max_number := CASE lottery_value
    WHEN 'mega-sena' THEN 60
    WHEN 'lotofacil' THEN 25
    WHEN 'dia-de-sorte' THEN 31
    WHEN 'quina' THEN 80
    WHEN 'lotomania' THEN 99
    WHEN 'dupla-sena' THEN 50
    WHEN 'mais-milionaria' THEN 50
    WHEN 'timemania' THEN 80
    WHEN 'super-sete' THEN 9
    ELSE NULL
  END;

  IF min_size IS NULL OR max_number IS NULL THEN
    RAISE EXCEPTION 'Unknown lottery %', lottery_value;
  END IF;
  IF cardinality(numbers_value) < min_size OR cardinality(numbers_value) > max_size THEN
    RAISE EXCEPTION '% games must contain between % and % numbers', lottery_value, min_size, max_size;
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
  IF cardinality(numbers_value) > 0
    AND NOT loto_lab_array_between(numbers_value, min_number, max_number) THEN
    RAISE EXCEPTION '% numbers must be between % and %', lottery_value, min_number, max_number;
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
  IF lottery_value IN (
    'quina', 'lotomania', 'dupla-sena', 'mais-milionaria', 'timemania', 'super-sete'
  ) AND fixed_count <> 0 THEN
    RAISE EXCEPTION '% fixed count must be 0', lottery_value;
  END IF;

  IF lottery_value = 'dia-de-sorte' THEN
    IF lucky_month_value IS NULL OR NOT loto_lab_valid_lucky_month(lucky_month_value) THEN
      RAISE EXCEPTION 'Dia de Sorte games require a valid Mês da Sorte';
    END IF;
  ELSIF lucky_month_value IS NOT NULL THEN
    RAISE EXCEPTION '% games cannot contain a Mês da Sorte', lottery_value;
  END IF;
END $$;
