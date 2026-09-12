ALTER TABLE real_bets
  ADD COLUMN research_hypothesis_id BIGINT NULL
    REFERENCES research_hypotheses(id) ON DELETE RESTRICT;

COMMENT ON COLUMN real_bets.research_hypothesis_id IS
  'Optional canonical research hypothesis applied experimentally by this real bet.';
