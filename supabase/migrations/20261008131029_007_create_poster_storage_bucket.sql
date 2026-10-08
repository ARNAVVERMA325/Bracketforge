/*
# Create storage bucket for tournament posters

1. Storage
- Create bucket `tournament-posters` (public, for poster images)
- Add storage policies for authenticated users to upload to their own folder
- Add policy for anon to read posters (they're public)

2. Security
- Authenticated users can upload files to their own folder (auth.uid() as folder name)
- Everyone can read poster images (they're public)
- Users can only delete their own files
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('tournament-posters', 'tournament-posters', true)
ON CONFLICT (id) DO NOTHING;

-- Upload: authenticated users, only to their own folder
DROP POLICY IF EXISTS "poster_upload_own" ON storage.objects;
CREATE POLICY "poster_upload_own" ON storage.objects FOR INSERT
TO authenticated WITH CHECK (
  bucket_id = 'tournament-posters'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Read: everyone (public bucket)
DROP POLICY IF EXISTS "poster_read_all" ON storage.objects;
CREATE POLICY "poster_read_all" ON storage.objects FOR SELECT
TO anon, authenticated USING (
  bucket_id = 'tournament-posters'
);

-- Delete: only own files
DROP POLICY IF EXISTS "poster_delete_own" ON storage.objects;
CREATE POLICY "poster_delete_own" ON storage.objects FOR DELETE
TO authenticated USING (
  bucket_id = 'tournament-posters'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
