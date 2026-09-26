-- Deleting a merch item that has income logged against it only marks it deleted,
-- so past income keeps its category / sub-category / item for sales reporting.
ALTER TABLE merch_items
  ADD COLUMN deleted_at TIMESTAMPTZ;
