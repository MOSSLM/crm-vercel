import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { describeImage } from "@/lib/ai/describe-image";
import {
  DEFAULT_AUTOTAG_PROVIDER,
  DEFAULT_AUTOTAG_MODEL,
  isValidAutotagProvider,
  type AutotagProvider,
} from "@/lib/ai/media-autotag-options";
import { normalizeServiceTags, formatServiceTag } from "@/utils/serviceTags";
import { MEDIA_LIBRARY_UNIVERSAL_TAG } from "@/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Upper bound of images analysed per request (serverless time budget). The UI
 *  loops calling this endpoint until nothing remains. */
const MAX_PER_CALL = 24;
/** How many images are analysed in parallel. */
const CONCURRENCY = 4;

interface MediaRow {
  id: string;
  public_url: string;
  service_tags: unknown;
  alt_text: string | null;
  description: string | null;
}

/** Authorized service-tag catalogue — distinct company tags, minus excluded,
 *  minus tags disabled in the allowlist (same source as the site-builder). */
async function loadAllowedTags(sb: ReturnType<typeof getServiceClient>): Promise<string[]> {
  const [{ data: rows }, { data: settings }] = await Promise.all([
    sb.from("entreprises").select("service_tags, premiers_tags").not("service_tags", "is", null),
    sb.from("enrichment_tag_settings").select("tag, allowed"),
  ]);
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
  return Array.from(set).sort((a, b) => a.localeCompare(b, "fr"));
}

/** Runs `worker` over `items` with bounded concurrency, preserving order. */
async function mapLimit<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function run(): Promise<void> {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await worker(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

export const POST = withAuth({}, async ({ req, cors }) => {
  let body: { ids?: unknown; only_untagged?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* empty body → treat as only_untagged */
  }

  const sb = getServiceClient();

  // Provider / model from settings (default = economical Haiku).
  const { data: cfg } = await sb
    .from("media_autotag_settings")
    .select("provider, model")
    .eq("id", "default")
    .maybeSingle();
  const provider: AutotagProvider = isValidAutotagProvider(cfg?.provider)
    ? cfg.provider
    : DEFAULT_AUTOTAG_PROVIDER;
  const model = typeof cfg?.model === "string" && cfg.model ? cfg.model : DEFAULT_AUTOTAG_MODEL;

  const allowedTags = await loadAllowedTags(sb);
  if (allowedTags.length === 0) {
    return jsonError("Aucun service tag autorisé — impossible de taguer.", 400, {}, cors);
  }

  // Resolve the target rows.
  const ids = Array.isArray(body.ids)
    ? (body.ids as unknown[]).filter((x): x is string => typeof x === "string")
    : null;

  let rows: MediaRow[] = [];
  if (ids && ids.length > 0) {
    const { data, error } = await sb
      .from("media_library")
      .select("id, public_url, service_tags, alt_text, description")
      .in("id", ids.slice(0, MAX_PER_CALL));
    if (error) return jsonError(error.message, 500, {}, cors);
    rows = (data ?? []) as MediaRow[];
  } else {
    // only_untagged: fetch recent rows and keep those with no service tags.
    const { data, error } = await sb
      .from("media_library")
      .select("id, public_url, service_tags, alt_text, description")
      .order("created_at", { ascending: false })
      .limit(MAX_PER_CALL * 4);
    if (error) return jsonError(error.message, 500, {}, cors);
    rows = ((data ?? []) as MediaRow[])
      .filter((r) => !Array.isArray(r.service_tags) || (r.service_tags as unknown[]).length === 0)
      .slice(0, MAX_PER_CALL);
  }

  if (rows.length === 0) {
    return json({ processed: 0, updated: 0, failures: [], done: true }, { headers: cors });
  }

  const failures: { id: string; error: string }[] = [];
  let updated = 0;

  await mapLimit(rows, CONCURRENCY, async (row) => {
    if (!row.public_url) {
      failures.push({ id: row.id, error: "public_url manquant" });
      return;
    }
    try {
      const result = await describeImage({ imageUrl: row.public_url, allowedTags, provider, model });
      // Empty tags → universal, so the image is at least usable as a fallback.
      const tags = result.service_tags.length > 0 ? result.service_tags : [MEDIA_LIBRARY_UNIVERSAL_TAG];
      const patch: Record<string, unknown> = { service_tags: tags };
      if (result.alt_text) patch.alt_text = result.alt_text;
      if (result.description) patch.description = result.description;
      const { error } = await sb.from("media_library").update(patch).eq("id", row.id);
      if (error) {
        failures.push({ id: row.id, error: error.message });
      } else {
        updated++;
      }
    } catch (e) {
      failures.push({ id: row.id, error: e instanceof Error ? e.message : String(e) });
    }
  });

  // `done` tells the UI whether an only_untagged sweep can stop.
  const done = ids ? true : rows.length < MAX_PER_CALL;
  return json({ processed: rows.length, updated, failures, done, provider, model }, { headers: cors });
});
