-- Align PostgreSQL strategy invariants with the application domain contract.

CREATE OR REPLACE FUNCTION loto_lab_prevent_strategy_lottery_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.lottery IS DISTINCT FROM OLD.lottery THEN
    RAISE EXCEPTION 'Strategy lottery is immutable';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS strategies_lottery_immutable_trigger ON strategies;
CREATE TRIGGER strategies_lottery_immutable_trigger
BEFORE UPDATE OF lottery ON strategies
FOR EACH ROW
EXECUTE FUNCTION loto_lab_prevent_strategy_lottery_change();

CREATE OR REPLACE FUNCTION loto_lab_prevent_strategy_version_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Strategy versions are immutable';
END $$;

DROP TRIGGER IF EXISTS strategy_versions_immutable_trigger ON strategy_versions;
CREATE TRIGGER strategy_versions_immutable_trigger
BEFORE UPDATE OR DELETE ON strategy_versions
FOR EACH ROW
EXECUTE FUNCTION loto_lab_prevent_strategy_version_mutation();
