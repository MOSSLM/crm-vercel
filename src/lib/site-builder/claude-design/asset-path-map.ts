/**
 * Builds `public URL → bundle-relative path` for a site's uploaded assets.
 *
 * Every template uploads its OWN copy of the same picture, so the URLs of
 * `images/marque-daikin.png` differ between "Classique" and "Brut" while
 * `site_builder_assets.original_path` — written at import time by
 * `upload-bundle-images` — is identical. That column is therefore the only
 * structure-free, copy-free way to recognise the same image slot across two
 * designs, and it powers `remapOverrides`' last-resort `asset` matcher.
 *
 * Rows uploaded from the editor's picker have a NULL `original_path` (they are
 * the operator's own photos, not bundle images) and are skipped.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** Supabase caps a single response; a template ships well under this. */
const MAX_ROWS = 2000;

export async function assetPathMap(
  supabase: SupabaseClient,
  siteIds: string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(siteIds.filter(Boolean))];
  const out = new Map<string, string>();
  if (ids.length === 0) return out;

  const { data, error } = await supabase
    .from("site_builder_assets")
    .select("public_url, original_path")
    .in("site_id", ids)
    .not("original_path", "is", null)
    .limit(MAX_ROWS);
  // A missing map only disables one matcher tier, so a failure here must never
  // fail the import it serves.
  if (error || !data) return out;

  for (const row of data as Array<{ public_url: string | null; original_path: string | null }>) {
    if (row.public_url && row.original_path) out.set(row.public_url, row.original_path);
  }
  return out;
}
