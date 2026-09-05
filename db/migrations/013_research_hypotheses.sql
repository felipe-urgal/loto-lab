CREATE TABLE research_hypotheses (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  lottery TEXT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  decision TEXT NULL,
  decision_reason TEXT NULL,
  decided_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT research_hypotheses_title_check
    CHECK (char_length(btrim(title)) BETWEEN 1 AND 160),
  CONSTRAINT research_hypotheses_description_check
    CHECK (char_length(btrim(description)) BETWEEN 1 AND 4000),
  CONSTRAINT research_hypotheses_lottery_check
    CHECK (lottery IS NULL OR lottery IN ('mega-sena', 'lotofacil', 'dia-de-sorte')),
  CONSTRAINT research_hypotheses_status_check
    CHECK (status IN ('open', 'decided')),
  CONSTRAINT research_hypotheses_decision_check
    CHECK (
      decision IS NULL
      OR decision IN ('inconclusive', 'rejected', 'continue-testing', 'applied-experimentally')
    ),
  CONSTRAINT research_hypotheses_decision_state_check
    CHECK (
      (
        status = 'open'
        AND decision IS NULL
        AND decision_reason IS NULL
        AND decided_at IS NULL
      )
      OR
      (
        status = 'decided'
        AND decision IS NOT NULL
        AND char_length(btrim(decision_reason)) BETWEEN 1 AND 4000
        AND decided_at IS NOT NULL
      )
    )
);

CREATE INDEX research_hypotheses_created_at_idx
  ON research_hypotheses (created_at DESC, id DESC);

CREATE INDEX research_hypotheses_lottery_created_at_idx
  ON research_hypotheses (lottery, created_at DESC, id DESC);
