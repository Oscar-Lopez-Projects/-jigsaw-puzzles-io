-- Create a public storage bucket for community puzzle images
INSERT INTO storage.buckets (id, name, public)
VALUES ('puzzle-images', 'puzzle-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to read images (public bucket)
CREATE POLICY "Public read access" ON storage.objects
  FOR SELECT USING (bucket_id = 'puzzle-images');

-- Allow authenticated users to upload images
CREATE POLICY "Authenticated users can upload" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'puzzle-images' AND auth.role() = 'authenticated');

-- Allow users to delete their own uploads
CREATE POLICY "Users can delete own uploads" ON storage.objects
  FOR DELETE USING (bucket_id = 'puzzle-images' AND auth.uid()::text = (storage.foldername(name))[1]);
