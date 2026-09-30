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
      'ALTER TABLE %I ADD CONSTRAINT %I CHECK (lottery IN (''mega-sena'', ''lotofacil'', ''dia-de-sorte'', ''quina'', ''lotomania'', ''dupla-sena''))',
      table_name,
      constraint_name
    );
  END LOOP;
END $$;

DO $$
BEGIN
  IF to_regclass('public.agenda_notifications') IS NOT NULL THEN
    ALTER TABLE agenda_notifications
      DROP CONSTRAINT IF EXISTS agenda_notifications_lottery_check;
    ALTER TABLE agenda_notifications
      ADD CONSTRAINT agenda_notifications_lottery_check
      CHECK (
        lottery IS NULL OR lottery IN (
          'mega-sena',
          'lotofacil',
          'dia-de-sorte',
          'quina',
          'lotomania',
          'dupla-sena'
        )
      );
  END IF;

  IF to_regclass('public.research_hypotheses') IS NOT NULL THEN
    ALTER TABLE research_hypotheses
      DROP CONSTRAINT IF EXISTS research_hypotheses_lottery_check;
    ALTER TABLE research_hypotheses
      ADD CONSTRAINT research_hypotheses_lottery_check
      CHECK (
        lottery IS NULL OR lottery IN (
          'mega-sena',
          'lotofacil',
          'dia-de-sorte',
          'quina',
          'lotomania',
          'dupla-sena'
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.contests') IS NOT NULL THEN
    ALTER TABLE contests
      ADD COLUMN IF NOT EXISTS second_draw_numbers SMALLINT[];
    ALTER TABLE contests
      DROP CONSTRAINT IF EXISTS contests_second_draw_numbers_not_empty;
    ALTER TABLE contests
      ADD CONSTRAINT contests_second_draw_numbers_not_empty
      CHECK (second_draw_numbers IS NULL OR cardinality(second_draw_numbers) > 0);
  END IF;

  IF to_regclass('public.generated_games') IS NOT NULL THEN
    ALTER TABLE generated_games
      ADD COLUMN IF NOT EXISTS mirror_numbers SMALLINT[];
    ALTER TABLE generated_games
      DROP CONSTRAINT IF EXISTS generated_games_mirror_numbers_not_empty;
    ALTER TABLE generated_games
      ADD CONSTRAINT generated_games_mirror_numbers_not_empty
      CHECK (mirror_numbers IS NULL OR cardinality(mirror_numbers) > 0);
  END IF;

  IF to_regclass('public.contest_prize_tiers') IS NOT NULL THEN
    ALTER TABLE contest_prize_tiers
      ADD COLUMN IF NOT EXISTS draw_number SMALLINT NOT NULL DEFAULT 1;
    ALTER TABLE contest_prize_tiers
      DROP CONSTRAINT IF EXISTS contest_prize_tiers_draw_number_check;
    ALTER TABLE contest_prize_tiers
      ADD CONSTRAINT contest_prize_tiers_draw_number_check
      CHECK (draw_number IN (1, 2));

    ALTER TABLE contest_prize_tiers
      DROP CONSTRAINT IF EXISTS contest_prize_tiers_unique;
    ALTER TABLE contest_prize_tiers
      DROP CONSTRAINT IF EXISTS contest_prize_tiers_draw_unique;
    ALTER TABLE contest_prize_tiers
      ADD CONSTRAINT contest_prize_tiers_draw_unique
      UNIQUE (contest_id, draw_number, description);
  END IF;
END $$;
