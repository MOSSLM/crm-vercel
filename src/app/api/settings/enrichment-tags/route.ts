import { NextRequest } from "next/server";
import { requireUser } from "@/app/api/_lib/auth";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { json, jsonError } from "@/app/api/_lib/respond";
import { corsHeadersFor, preflight } from "@/app/api/_lib/cors";

// Taxonomie fixe des services que l'extraction LLM de l'edge function peut produire
// (cf. SERVICE_TAGS_TAXONOMY dans "edge function/types.ts"). On les inclut toujours
// dans la liste afin de pouvoir les interdire même si aucune entreprise ne les porte.
const SERVICE_TAGS_TAXONOMY = [
  "climatisation",
  "pompe à chaleur",
  "chauffage",
  "ventilation",
  "plomberie",
  "électricité",
  "photovoltaïque",
  "rénovation",
];

export async function OPTIONS(req: NextRequest) {
  return preflight(req);
}

export async function GET(req: NextRequest) {
  const cors = corsHeadersFor(req);
  const result = await requireUser(req, cors);
  if (!result.ok) return result.response;

  const sb = getServiceClient();

  const [distinctRes, settingsRes] = await Promise.all([
    sb.from("enrichment_distinct_service_tags").select("tag"),
    sb.from("enrichment_tag_settings").select("tag, allowed"),
  ]);

  if (distinctRes.error) return jsonError(distinctRes.error.message, 500, {}, cors);
  if (settingsRes.error) return jsonError(settingsRes.error.message, 500, {}, cors);

  const allowedByTag = new Map<string, boolean>();
  for (const row of settingsRes.data ?? []) {
    if (typeof row.tag === "string") allowedByTag.set(row.tag, !!row.allowed);
  }

  const tagSet = new Set<string>();
  for (const row of distinctRes.data ?? []) {
    const tag = typeof row.tag === "string" ? row.tag.trim() : "";
    if (tag) tagSet.add(tag);
  }
  for (const tag of SERVICE_TAGS_TAXONOMY) tagSet.add(tag);

  const tags = Array.from(tagSet)
    .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }))
    .map((tag) => ({ tag, allowed: allowedByTag.get(tag) ?? true }));

  return json({ tags }, { headers: cors });
}

export async function PUT(req: NextRequest) {
  const cors = corsHeadersFor(req);
  const result = await requireUser(req, cors);
  if (!result.ok) return result.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("invalid_json", 400, {}, cors);
  }

  const rawTags = (body as { tags?: unknown })?.tags;
  if (!Array.isArray(rawTags)) {
    return jsonError("tags_must_be_array", 400, {}, cors);
  }

  const now = new Date().toISOString();
  const rows: { tag: string; allowed: boolean; updated_at: string }[] = [];
  for (const entry of rawTags) {
    const tag = typeof (entry as { tag?: unknown })?.tag === "string"
      ? ((entry as { tag: string }).tag).trim()
      : "";
    if (!tag) continue;
    rows.push({ tag, allowed: !!(entry as { allowed?: unknown }).allowed, updated_at: now });
  }

  if (rows.length === 0) {
    return jsonError("no_valid_tags", 400, {}, cors);
  }

  const { error } = await getServiceClient()
    .from("enrichment_tag_settings")
    .upsert(rows, { onConflict: "tag" });

  if (error) return jsonError(error.message, 500, {}, cors);
  return json({ ok: true, count: rows.length }, { status: 200, headers: cors });
}
