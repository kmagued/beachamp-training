-- Merch stock tests: the sale trigger, restock/recount and player availability.
-- Runs against STAGING in one transaction that always rolls back, so nothing persists.
--   ./scripts/db/test-merch-stock.sh staging
--
-- Kept ASCII-only: the multiplication sign in stock messages is built with chr(215).

\set ON_ERROR_STOP on
SET client_encoding = 'UTF8';
BEGIN;
SET LOCAL plpgsql.check_asserts = on;

-- ── Fixtures ────────────────────────────────────────────────────────────
-- An admin records the sales, a player checks what players can see.
SELECT set_config('mt.admin', coalesce((SELECT id::text FROM profiles WHERE role = 'admin' ORDER BY created_at LIMIT 1), ''), true);
SELECT set_config('mt.player', coalesce((SELECT id::text FROM profiles WHERE role = 'player' ORDER BY created_at LIMIT 1), ''), true);
SELECT set_config('mt.income_cat', coalesce((SELECT id::text FROM income_categories WHERE is_merch ORDER BY created_at LIMIT 1), ''), true);
SELECT set_config('mt.apparel', coalesce((SELECT id::text FROM merch_categories WHERE name = 'Apparel'), ''), true);
SELECT set_config('mt.accessories', coalesce((SELECT id::text FROM merch_categories WHERE name = 'Accessories'), ''), true);

DO $$
DECLARE
  sub UUID;
  item UUID;
  hidden UUID;
BEGIN
  ASSERT current_setting('mt.admin') <> '', 'fixture: staging needs an admin profile';
  ASSERT current_setting('mt.player') <> '', 'fixture: staging needs a player profile';
  ASSERT current_setting('mt.income_cat') <> '', 'fixture: staging needs the Merch income category';

  INSERT INTO merch_subcategories (category_id, name)
    VALUES (current_setting('mt.apparel')::uuid, 'ZZ test') RETURNING id INTO sub;
  INSERT INTO merch_items (name, category_id, subcategory_id, price, is_active)
    VALUES ('ZZ Test Hoodie', current_setting('mt.apparel')::uuid, sub, 1200, TRUE) RETURNING id INTO item;
  INSERT INTO merch_stock (item_id, size, quantity) VALUES (item, 'M', 5), (item, 'L', 2);

  INSERT INTO merch_items (name, category_id, subcategory_id, price, is_active)
    VALUES ('ZZ Hidden Hoodie', current_setting('mt.apparel')::uuid, sub, 900, FALSE) RETURNING id INTO hidden;
  INSERT INTO merch_stock (item_id, size, quantity) VALUES (hidden, 'M', 3);

  PERFORM set_config('mt.sub', sub::text, true);
  PERFORM set_config('mt.item', item::text, true);
  PERFORM set_config('mt.hidden', hidden::text, true);
END $$;

CREATE FUNCTION pg_temp.qty(p_size TEXT) RETURNS INTEGER LANGUAGE sql AS $$
  SELECT quantity FROM merch_stock WHERE item_id = current_setting('mt.item')::uuid AND size = p_size
$$;

CREATE FUNCTION pg_temp.sell(p_size TEXT, p_qty INTEGER) RETURNS UUID LANGUAGE sql AS $$
  INSERT INTO income (category_id, amount, income_date, created_by, merch_item_id, merch_size, merch_quantity)
  VALUES (current_setting('mt.income_cat')::uuid, 100, CURRENT_DATE, current_setting('mt.admin')::uuid,
          current_setting('mt.item')::uuid, p_size, p_qty)
  RETURNING id
$$;

-- ── 0. Migration backfill ───────────────────────────────────────────────
DO $$ BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM merch_items WHERE category_id IS NULL), '0: every product has a category';
  ASSERT NOT EXISTS (
    SELECT 1 FROM merch_items i
     WHERE i.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM merch_stock s WHERE s.item_id = i.id)
  ), '0: every live product has at least one stock row';
END $$;

-- ── 1. A sale takes its units from that size ────────────────────────────
DO $$ DECLARE sale UUID; BEGIN
  sale := pg_temp.sell('M', 2);
  PERFORM set_config('mt.sale', sale::text, true);
  ASSERT pg_temp.qty('M') = 3, format('1: M should be 3, got %s', pg_temp.qty('M'));
END $$;

-- ── 2. Editing only the amount leaves stock alone ───────────────────────
DO $$ BEGIN
  UPDATE income SET amount = 150 WHERE id = current_setting('mt.sale')::uuid;
  ASSERT pg_temp.qty('M') = 3, format('2: M should stay 3, got %s', pg_temp.qty('M'));
END $$;

-- ── 3. Moving the sale to another size gives back the old units ─────────
DO $$ BEGIN
  UPDATE income SET merch_size = 'L', merch_quantity = 1 WHERE id = current_setting('mt.sale')::uuid;
  ASSERT pg_temp.qty('M') = 5, format('3: M should be back to 5, got %s', pg_temp.qty('M'));
  ASSERT pg_temp.qty('L') = 1, format('3: L should be 1, got %s', pg_temp.qty('L'));
END $$;

-- ── 4. Raising the quantity only needs the extra units ──────────────────
DO $$ BEGIN
  UPDATE income SET merch_quantity = 2 WHERE id = current_setting('mt.sale')::uuid;
  ASSERT pg_temp.qty('L') = 0, format('4: L should be 0, got %s', pg_temp.qty('L'));
END $$;

-- ── 5. Soft-deleting the sale gives its units back ──────────────────────
DO $$ BEGIN
  UPDATE income SET is_active = FALSE WHERE id = current_setting('mt.sale')::uuid;
  ASSERT pg_temp.qty('L') = 2, format('5: L should be back to 2, got %s', pg_temp.qty('L'));
END $$;

-- ── 6. Overselling is refused and changes nothing ───────────────────────
DO $$ BEGIN
  BEGIN
    PERFORM pg_temp.sell('M', 6);
    RAISE EXCEPTION '6: overselling M should have failed';
  EXCEPTION WHEN SQLSTATE 'MS001' THEN
    ASSERT SQLERRM = format('Only 5 %s M left of ZZ Test Hoodie', chr(215)), format('6: wrong message: %s', SQLERRM);
  END;
  ASSERT pg_temp.qty('M') = 5, format('6: M should stay 5, got %s', pg_temp.qty('M'));
END $$;

-- ── 7. A size at zero says there is none left ───────────────────────────
DO $$ BEGIN
  UPDATE merch_stock SET quantity = 0 WHERE item_id = current_setting('mt.item')::uuid AND size = 'L';
  BEGIN
    PERFORM pg_temp.sell('L', 1);
    RAISE EXCEPTION '7: selling an empty size should have failed';
  EXCEPTION WHEN SQLSTATE 'MS001' THEN
    ASSERT SQLERRM = 'No L left of ZZ Test Hoodie', format('7: wrong message: %s', SQLERRM);
  END;
  UPDATE merch_stock SET quantity = 2 WHERE item_id = current_setting('mt.item')::uuid AND size = 'L';
END $$;

-- ── 8. A size the product doesn't stock is refused ──────────────────────
DO $$ BEGIN
  BEGIN
    PERFORM pg_temp.sell('XXL', 1);
    RAISE EXCEPTION '8: selling an unstocked size should have failed';
  EXCEPTION WHEN SQLSTATE 'MS002' THEN
    ASSERT SQLERRM = 'ZZ Test Hoodie no longer comes in XXL', format('8: wrong message: %s', SQLERRM);
  END;
END $$;

-- ── 9. A product-linked sale must say which size ────────────────────────
DO $$ BEGIN
  BEGIN
    PERFORM pg_temp.sell(NULL, 1);
    RAISE EXCEPTION '9: a linked sale without a size should have failed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

-- ── 10. Restock adds arrivals; rejects negatives and unknown sizes ──────
DO $$ BEGIN
  PERFORM merch_restock(current_setting('mt.item')::uuid, '{"M": 3, "L": 0}');
  ASSERT pg_temp.qty('M') = 8, format('10: M should be 8, got %s', pg_temp.qty('M'));
  ASSERT pg_temp.qty('L') = 2, format('10: L should stay 2, got %s', pg_temp.qty('L'));
  BEGIN
    PERFORM merch_restock(current_setting('mt.item')::uuid, '{"L": 4, "M": -1}');
    RAISE EXCEPTION '10: a negative restock should have failed';
  EXCEPTION WHEN SQLSTATE 'MS003' THEN NULL;
  END;
  BEGIN
    PERFORM merch_restock(current_setting('mt.item')::uuid, '{"L": 4, "XXL": 1}');
    RAISE EXCEPTION '10: restocking an unstocked size should have failed';
  EXCEPTION WHEN SQLSTATE 'MS002' THEN NULL;
  END;
  ASSERT pg_temp.qty('L') = 2, format('10: failed restocks must not change L, got %s', pg_temp.qty('L'));
END $$;

-- ── 11. Recount sets exact counts when nothing moved ────────────────────
DO $$ DECLARE res JSONB; BEGIN
  res := merch_recount(current_setting('mt.item')::uuid, '[{"size": "M", "expected": 8, "counted": 7}]');
  ASSERT (res->>'ok')::boolean, format('11: recount should succeed, got %s', res);
  ASSERT pg_temp.qty('M') = 7, format('11: M should be 7, got %s', pg_temp.qty('M'));
END $$;

-- ── 12. A stale recount writes nothing, not even its fresh sizes ────────
DO $$ DECLARE res JSONB; BEGIN
  res := merch_recount(current_setting('mt.item')::uuid,
    '[{"size": "L", "expected": 2, "counted": 9}, {"size": "M", "expected": 8, "counted": 1}]');
  ASSERT NOT (res->>'ok')::boolean, format('12: stale recount should report ok=false, got %s', res);
  ASSERT pg_temp.qty('M') = 7, format('12: M should stay 7, got %s', pg_temp.qty('M'));
  ASSERT pg_temp.qty('L') = 2, format('12: L should stay 2, got %s', pg_temp.qty('L'));
  ASSERT res->'stock'->>'M' = '7', format('12: returned stock should show M=7, got %s', res);
END $$;

-- ── 13. Hard-deleting an active sale gives its units back ───────────────
DO $$ DECLARE sale UUID; BEGIN
  sale := pg_temp.sell('M', 2);
  ASSERT pg_temp.qty('M') = 5, format('13: M should be 5 after the sale, got %s', pg_temp.qty('M'));
  DELETE FROM income WHERE id = sale;
  ASSERT pg_temp.qty('M') = 7, format('13: M should be back to 7, got %s', pg_temp.qty('M'));
END $$;

-- ── 14. Giving back to a removed size is skipped, not re-created ────────
DO $$ DECLARE sale UUID; BEGIN
  sale := pg_temp.sell('L', 1);
  DELETE FROM merch_stock WHERE item_id = current_setting('mt.item')::uuid AND size = 'L';
  UPDATE income SET is_active = FALSE WHERE id = sale;
  ASSERT NOT EXISTS (SELECT 1 FROM merch_stock WHERE item_id = current_setting('mt.item')::uuid AND size = 'L'),
    '14: the removed L row must not come back';
  INSERT INTO merch_stock (item_id, size, quantity) VALUES (current_setting('mt.item')::uuid, 'L', 0);
END $$;

-- ── 15. A product's sub-category must belong to its category ────────────
DO $$ BEGIN
  BEGIN
    INSERT INTO merch_items (name, category_id, subcategory_id, price)
      VALUES ('ZZ mismatch', current_setting('mt.accessories')::uuid, current_setting('mt.sub')::uuid, 10);
    RAISE EXCEPTION '15: a sub-category from another category should have failed';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
END $$;

-- ── 16. Players get yes/no availability for visible products, never counts
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('mt.player'), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM merch_stock) = 0, '16: players must not read merch_stock';
  ASSERT (SELECT count(*) FROM merch_available_sizes() WHERE item_id = current_setting('mt.item')::uuid) = 2,
    '16: both sizes of the visible fixture should be listed';
  ASSERT (SELECT in_stock FROM merch_available_sizes() WHERE item_id = current_setting('mt.item')::uuid AND size = 'M'),
    '16: M (7 left) should be in stock';
  ASSERT NOT (SELECT in_stock FROM merch_available_sizes() WHERE item_id = current_setting('mt.item')::uuid AND size = 'L'),
    '16: L (0 left) should be out of stock';
  ASSERT NOT EXISTS (SELECT 1 FROM merch_available_sizes() WHERE item_id = current_setting('mt.hidden')::uuid),
    '16: hidden products must not be listed';
END $$;
RESET ROLE;

ROLLBACK;
\echo 'merch stock tests: all passed (changes rolled back)'
