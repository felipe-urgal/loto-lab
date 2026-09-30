CREATE TABLE IF NOT EXISTS lottery_product_results (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id TEXT NOT NULL CHECK (
    product_id IN (
      'mega-sena',
      'lotofacil',
      'dia-de-sorte',
      'quina',
      'lotomania',
      'dupla-sena',
      'mais-milionaria',
      'timemania',
      'super-sete',
      'loteca',
      'federal'
    )
  ),
  contest_number INTEGER NOT NULL CHECK (contest_number > 0),
  draw_date DATE NOT NULL,
  result JSONB NOT NULL,
  prize_tiers JSONB,
  amount_collected NUMERIC(16, 2),
  source JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT lottery_product_results_unique UNIQUE (product_id, contest_number)
);

CREATE INDEX IF NOT EXISTS lottery_product_results_product_draw_date_idx
  ON lottery_product_results (product_id, draw_date DESC);
