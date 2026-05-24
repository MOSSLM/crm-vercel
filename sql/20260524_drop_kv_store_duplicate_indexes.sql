-- kv_store_5c06d9e7 had 27 indexes on `key` (kv_store_5c06d9e7_key_idx +
-- key_idx1 through key_idx26). Each one is identical and gets written on
-- every upsert. Keep `kv_store_5c06d9e7_key_idx`, drop the rest.
DO $$
DECLARE
  i integer;
BEGIN
  FOR i IN 1..26 LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.kv_store_5c06d9e7_key_idx%s', i);
  END LOOP;
END $$;
