-- ─── Section Instance Blocks ──────────────────────────────────────────────────
-- Adds a `blocks` JSONB column to site_section_instances to store repeatable
-- items defined by a section schema's blocks[] (Shopify-like).
--
-- Each item has the shape:
--   { id: string, type: string, settings: Record<string, unknown> }
--
-- Until this migration is applied, blocks are read from `content.items`/`__blocks`
-- via the legacy adapter at runtime — no data loss.

ALTER TABLE site_section_instances
  ADD COLUMN IF NOT EXISTS blocks JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN site_section_instances.blocks IS
  'Repeatable items defined by the section schema''s blocks[]. '
  'Each item: { id: string, type: string, settings: Record<string,unknown> }. '
  'Order in the array is the render order.';

-- GIN index for queries that filter on block contents (e.g. analytics)
CREATE INDEX IF NOT EXISTS idx_site_section_instances_blocks_gin
  ON site_section_instances USING GIN (blocks);
