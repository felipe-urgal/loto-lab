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

CREATE OR REPLACE FUNCTION loto_lab_validate_research_backtest_evidence()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  hypothesis_status TEXT;
  hypothesis_lottery TEXT;
  backtest_lottery TEXT;
BEGIN
  SELECT status, lottery
    INTO hypothesis_status, hypothesis_lottery
  FROM research_hypotheses
  WHERE id = NEW.hypothesis_id
  FOR SHARE;

  IF hypothesis_status IS NULL THEN
    RAISE EXCEPTION 'Unknown research hypothesis %', NEW.hypothesis_id;
  END IF;
  IF hypothesis_status <> 'open' THEN
    RAISE EXCEPTION 'Research hypothesis % must be open to attach evidence', NEW.hypothesis_id;
  END IF;

  SELECT lottery
    INTO backtest_lottery
  FROM backtest_runs
  WHERE id = NEW.backtest_run_id;

  IF backtest_lottery IS NULL THEN
    RAISE EXCEPTION 'Unknown backtest run %', NEW.backtest_run_id;
  END IF;
  IF hypothesis_lottery IS NOT NULL AND hypothesis_lottery <> backtest_lottery THEN
    RAISE EXCEPTION 'Research hypothesis % lottery % does not match backtest run % lottery %',
      NEW.hypothesis_id, hypothesis_lottery, NEW.backtest_run_id, backtest_lottery;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER research_hypothesis_backtest_evidence_integrity_trigger
BEFORE INSERT OR UPDATE OF hypothesis_id, backtest_run_id
ON research_hypothesis_backtest_evidence
FOR EACH ROW EXECUTE FUNCTION loto_lab_validate_research_backtest_evidence();
