CREATE TABLE research_hypothesis_backtest_evidence (
  hypothesis_id BIGINT NOT NULL
    REFERENCES research_hypotheses(id) ON DELETE CASCADE,
  backtest_run_id BIGINT NOT NULL
    REFERENCES backtest_runs(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (hypothesis_id, backtest_run_id)
);

CREATE INDEX research_hypothesis_backtest_evidence_run_idx
  ON research_hypothesis_backtest_evidence (backtest_run_id, hypothesis_id);
