-- Create storage bucket for competitor page screenshots
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('competitor-screenshots', 'competitor-screenshots', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Public read access for screenshots
CREATE POLICY "Public read access for competitor screenshots"
ON storage.objects FOR SELECT
USING (bucket_id = 'competitor-screenshots');

-- Service role can upload screenshots
CREATE POLICY "Service role can upload competitor screenshots"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'competitor-screenshots');

-- Service role can delete old screenshots
CREATE POLICY "Service role can delete competitor screenshots"
ON storage.objects FOR DELETE
USING (bucket_id = 'competitor-screenshots');