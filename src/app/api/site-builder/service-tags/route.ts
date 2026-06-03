import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { normalizeServiceTags, formatServiceTag } from "@/utils/serviceTags";

export const dynamic = "force-dynamic";

/**
 * Catalogue of authorized service tags across all companies — used by the site
 * builder so a template can be prepared with content/blocks/pages for every
 * eventual service tag, even when no enterprise is linked yet. Render-time
 * filtering still keys off the linked enterprise's own tags, so assigning a
 * company later only surfaces its matching tags.
 *
 * Source of truth: distinct `entreprises.service_tags`, normalized (drops
 * EXCLUDED_SERVICE_TAGS), minus tags explicitly disabled in the global
 * allowlist `enrichment_tag_settings` (a tag with no row is allowed).
 */
export const GET = withAuth({}, async () => {
  const supabase = getServiceClient();
  const [{ data: rows, error }, { data: settings }] = await Promise.all([
    supabase.from("entreprises").select("service_tags, premiers_tags").not("service_tags", "is", null),
    supabase.from("enrichment_tag_settings").select("tag, allowed"),
  ]);
  if (error) return jsonError(error.message, 500);

  // Tags explicitly disabled in the allowlist (absent = allowed by default).
  const disallowed = new Set(
    ((settings ?? []) as Array<{ tag?: unknown; allowed?: unknown }>)
      .filter((s) => typeof s.tag === "string" && s.allowed === false)
      .map((s) => formatServiceTag(s.tag as string)),
  );

  const set = new Set<string>();
  for (const row of (rows ?? []) as Array<{ service_tags?: unknown; premiers_tags?: string | null }>) {
    for (const t of normalizeServiceTags(row.service_tags, row.premiers_tags ?? null)) {
      if (!disallowed.has(formatServiceTag(t))) set.add(t);
    }
  }

  const tags = Array.from(set).sort((a, b) => a.localeCompare(b, "fr"));
  return json({ tags });
});
