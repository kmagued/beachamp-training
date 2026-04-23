-- Photos that admins upload to promote each training group on the landing page
CREATE TABLE schedule_photos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  caption     TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  uploaded_by UUID REFERENCES profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_schedule_photos_group ON schedule_photos(group_id);
CREATE INDEX idx_schedule_photos_sort ON schedule_photos(sort_order);

ALTER TABLE schedule_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view schedule photos"
  ON schedule_photos FOR SELECT
  USING (TRUE);

CREATE POLICY "Admins can manage schedule photos"
  ON schedule_photos FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Public storage bucket for schedule photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('schedule-photos', 'schedule-photos', TRUE)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admins can upload schedule photos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'schedule-photos'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can delete schedule photos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'schedule-photos'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Anyone can view schedule photo files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'schedule-photos');
