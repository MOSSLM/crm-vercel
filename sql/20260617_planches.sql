-- Planches: a Milanote-style infinite-canvas board tool.
--
-- A "planche" is a board. Boards can nest (a board card opens a child board).
-- Every board holds free-floating cards (notes, images, files, links, todos,
-- colour swatches, columns, sub-boards) positioned on an infinite canvas, plus
-- optional connections (arrows) drawn between cards.

-- ---------------------------------------------------------------------------
-- Storage bucket (images + arbitrary file uploads)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('planches', 'planches', true, 52428800) -- 50 MB
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read planches" ON storage.objects;
CREATE POLICY "Public read planches"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'planches');

DROP POLICY IF EXISTS "Authenticated upload planches" ON storage.objects;
CREATE POLICY "Authenticated upload planches"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'planches');

DROP POLICY IF EXISTS "Authenticated update planches" ON storage.objects;
CREATE POLICY "Authenticated update planches"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'planches');

DROP POLICY IF EXISTS "Authenticated delete planches" ON storage.objects;
CREATE POLICY "Authenticated delete planches"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'planches');

-- ---------------------------------------------------------------------------
-- Boards
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS planches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL DEFAULT 'Sans titre',
  -- A board nested inside another board (breadcrumb chain). NULL = top level.
  parent_board_id UUID REFERENCES planches(id) ON DELETE CASCADE,
  -- The board-card on the parent that opens this board (kept in sync app-side).
  parent_card_id  UUID,
  icon            TEXT,
  color           TEXT,
  owner_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_planches_parent_board_id ON planches (parent_board_id);
CREATE INDEX IF NOT EXISTS idx_planches_owner_id ON planches (owner_id);
CREATE INDEX IF NOT EXISTS idx_planches_updated_at ON planches (updated_at DESC);

-- ---------------------------------------------------------------------------
-- Cards (the elements living on a board's canvas)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS planche_cards (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id        UUID NOT NULL REFERENCES planches(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,
  position_x      DOUBLE PRECISION NOT NULL DEFAULT 0,
  position_y      DOUBLE PRECISION NOT NULL DEFAULT 0,
  width           DOUBLE PRECISION NOT NULL DEFAULT 240,
  height          DOUBLE PRECISION,            -- NULL = auto height
  z_index         INTEGER NOT NULL DEFAULT 0,
  rotation        DOUBLE PRECISION NOT NULL DEFAULT 0,
  content         JSONB NOT NULL DEFAULT '{}'::jsonb,
  style           JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- When a card lives inside a column, this points at the column card.
  parent_card_id  UUID REFERENCES planche_cards(id) ON DELETE CASCADE,
  sort_order      DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT planche_cards_type_check CHECK (
    type IN ('note', 'text', 'image', 'file', 'link', 'todo', 'color', 'column', 'board')
  )
);

CREATE INDEX IF NOT EXISTS idx_planche_cards_board_id ON planche_cards (board_id);
CREATE INDEX IF NOT EXISTS idx_planche_cards_parent_card_id ON planche_cards (parent_card_id);

-- ---------------------------------------------------------------------------
-- Connections (arrows between cards)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS planche_connections (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id     UUID NOT NULL REFERENCES planches(id) ON DELETE CASCADE,
  from_card_id UUID NOT NULL REFERENCES planche_cards(id) ON DELETE CASCADE,
  to_card_id   UUID NOT NULL REFERENCES planche_cards(id) ON DELETE CASCADE,
  label        TEXT,
  style        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_planche_connections_board_id ON planche_connections (board_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION planches_set_updated_at()
RETURNS TRIGGER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_planches_updated_at ON planches;
CREATE TRIGGER trg_planches_updated_at
  BEFORE UPDATE ON planches
  FOR EACH ROW EXECUTE FUNCTION planches_set_updated_at();

DROP TRIGGER IF EXISTS trg_planche_cards_updated_at ON planche_cards;
CREATE TRIGGER trg_planche_cards_updated_at
  BEFORE UPDATE ON planche_cards
  FOR EACH ROW EXECUTE FUNCTION planches_set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — admin app talks through the service role, but keep parity with the
-- rest of the schema: authenticated users get full access, anon gets nothing.
-- ---------------------------------------------------------------------------
ALTER TABLE planches ENABLE ROW LEVEL SECURITY;
ALTER TABLE planche_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE planche_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated all planches" ON planches;
CREATE POLICY "Authenticated all planches"
  ON planches FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated all planche_cards" ON planche_cards;
CREATE POLICY "Authenticated all planche_cards"
  ON planche_cards FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated all planche_connections" ON planche_connections;
CREATE POLICY "Authenticated all planche_connections"
  ON planche_connections FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
