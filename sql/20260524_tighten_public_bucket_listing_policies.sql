-- Drop the broad SELECT policies on public buckets that allow listing.
-- Public buckets serve object URLs directly via storage.objects' is_public
-- flag and don't require a SELECT policy. Removing these blocks anon clients
-- from enumerating bucket contents while still allowing public URL access
-- to specific objects.
DROP POLICY IF EXISTS "public_read_lead_magnet_logos" ON storage.objects;
DROP POLICY IF EXISTS "Public read media-library" ON storage.objects;
DROP POLICY IF EXISTS "Public read site-builder assets" ON storage.objects;
