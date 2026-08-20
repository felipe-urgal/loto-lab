CREATE TABLE IF NOT EXISTS lottery_agenda (
  lottery TEXT PRIMARY KEY CHECK (lottery IN ('mega-sena', 'lotofacil', 'dia-de-sorte')),
  current_contest INTEGER NOT NULL,
  next_contest INTEGER NOT NULL,
  next_draw_date DATE,
  estimated_prize NUMERIC(18, 2),
  accumulated BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_key TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('next-contest', 'bet-awaiting', 'result-available', 'bet-checked', 'bet-prize', 'operation-warning')),
  lottery TEXT CHECK (lottery IS NULL OR lottery IN ('mega-sena', 'lotofacil', 'dia-de-sorte')),
  severity TEXT NOT NULL CHECK (severity IN ('info', 'success', 'warning', 'error')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  action_href TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_unread_created_at_idx
  ON notifications (created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS notifications_lottery_created_at_idx
  ON notifications (lottery, created_at DESC);
