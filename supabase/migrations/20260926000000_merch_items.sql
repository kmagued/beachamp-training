-- Merch catalog: admins manage items, players browse them (no purchasing in-app)
CREATE TABLE merch_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  category     TEXT NOT NULL CHECK (category IN ('apparel', 'accessories', 'equipment')),
  price        DECIMAL(10, 2) NOT NULL CHECK (price >= 0),
  description  TEXT,
  sizes        TEXT[] NOT NULL DEFAULT '{}',
  image_path   TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  is_sold_out  BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_by   UUID REFERENCES profiles(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_merch_items_sort ON merch_items(sort_order, created_at);

ALTER TABLE merch_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users can view active merch"
  ON merch_items FOR SELECT
  USING (auth.uid() IS NOT NULL AND is_active = TRUE);

CREATE POLICY "Admins can manage merch"
  ON merch_items FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Public storage bucket for merch photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('merch-images', 'merch-images', TRUE)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admins can upload merch images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'merch-images'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can delete merch images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'merch-images'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Anyone can view merch image files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'merch-images');
