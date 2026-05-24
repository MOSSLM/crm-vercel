-- staging_entreprises is a transient ingestion target with 0 rows currently.
-- google_place_id is the natural key for Google Places data; promote it.
ALTER TABLE public.staging_entreprises
  ALTER COLUMN google_place_id SET NOT NULL,
  ADD CONSTRAINT staging_entreprises_pkey PRIMARY KEY (google_place_id);
