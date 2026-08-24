CREATE TABLE IF NOT EXISTS real_bet_financial_revisions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  real_bet_id BIGINT NOT NULL REFERENCES real_bets(id) ON DELETE CASCADE,
  previous_total_prize_value NUMERIC(18, 2),
  new_total_prize_value NUMERIC(18, 2),
  previous_net_result NUMERIC(18, 2),
  new_net_result NUMERIC(18, 2),
  reason TEXT NOT NULL DEFAULT 'official-prize-refresh',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT real_bet_financial_revision_changed CHECK (
    previous_total_prize_value IS DISTINCT FROM new_total_prize_value
    OR previous_net_result IS DISTINCT FROM new_net_result
  )
);

CREATE INDEX IF NOT EXISTS real_bet_financial_revisions_bet_idx
  ON real_bet_financial_revisions (real_bet_id, created_at DESC, id DESC);
