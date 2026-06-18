-- Allow the remaining SAMA board element types on planche_cards: `table`
-- (coloured cell grid) and `line` (decorative connector / arrow). Columns and
-- their nested children already use the existing `column` type + parent_card_id.

ALTER TABLE planche_cards DROP CONSTRAINT IF EXISTS planche_cards_type_check;
ALTER TABLE planche_cards ADD CONSTRAINT planche_cards_type_check CHECK (
  type IN ('note', 'text', 'image', 'file', 'link', 'todo', 'color', 'column', 'board', 'table', 'line')
);
