-- Reliability hardening: real-bet target integrity and faster claimable-job lookup.

CREATE INDEX IF NOT EXISTS analysis_jobs_claimable_idx
  ON analysis_jobs (created_at, id)
  WHERE status = 'queued' AND cancel_requested = FALSE;

CREATE OR REPLACE FUNCTION loto_lab_validate_real_bet()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  batch_lottery TEXT;
  batch_target_contest INTEGER;
BEGIN
  SELECT lottery, target_contest_number
  INTO batch_lottery, batch_target_contest
  FROM generated_game_batches
  WHERE id = NEW.batch_id;

  IF batch_lottery IS NOT NULL AND NEW.lottery <> batch_lottery THEN
    RAISE EXCEPTION 'Real bet lottery % does not match batch lottery %', NEW.lottery, batch_lottery;
  END IF;
  IF batch_target_contest IS NOT NULL AND NEW.contest_number <> batch_target_contest THEN
    RAISE EXCEPTION 'Real bet contest % does not match batch target contest %', NEW.contest_number, batch_target_contest;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS real_bets_batch_integrity_trigger ON real_bets;
CREATE TRIGGER real_bets_batch_integrity_trigger
BEFORE INSERT OR UPDATE OF batch_id, lottery, contest_number ON real_bets
FOR EACH ROW EXECUTE FUNCTION loto_lab_validate_real_bet();
