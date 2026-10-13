-- Super Sete stores its seven ordered columns as JSONB in metadata.
-- A structured bet legitimately has no flat numbers; other bets remain nonempty.
ALTER TABLE real_bet_games
  DROP CONSTRAINT IF EXISTS real_bet_games_numbers_not_empty;

ALTER TABLE real_bet_games
  ADD CONSTRAINT real_bet_games_numbers_not_empty CHECK (
    cardinality(numbers) > 0
    OR (
      cardinality(numbers) = 0
      AND cardinality(fixed_numbers) = 0
      AND cardinality(variable_numbers) = 0
      AND jsonb_typeof(metadata->'columns') = 'array'
      AND jsonb_array_length(metadata->'columns') = 7
    )
  );
