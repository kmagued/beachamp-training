-- ═══════════════════════════════════════════════════════════════
-- Landing page photos (2026-10-31)
--   The landing page's gallery has five fixed spots: one large photo
--   and four small ones. An admin fills or replaces each spot from the
--   dashboard; a spot with no row shows a placeholder.
--
--   Safe to apply ahead of the code: nothing reads the table yet.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE landing_photos (
  slot         SMALLINT PRIMARY KEY CHECK (slot BETWEEN 1 AND 5),
  storage_path TEXT NOT NULL,
  uploaded_by  UUID REFERENCES profiles(id),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE landing_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view landing photos"
  ON landing_photos FOR SELECT
  USING (TRUE);

CREATE POLICY "Admins can manage landing photos"
  ON landing_photos FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Public storage bucket for the photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('landing-photos', 'landing-photos', TRUE)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admins can upload landing photos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'landing-photos'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can delete landing photos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'landing-photos'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Anyone can view landing photo files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'landing-photos');
