import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * GET /api/service-tag-defaults
 * Returns all rows ordered by display_order ASC.
 * Also returns the distinct list of service tags currently in use across
 * `entreprises.service_tags`, so the admin UI can offer to create defaults
 * for tags that have none yet.
 */
export async function GET() {
  const supabase = getSupabaseServiceClient();

  const [defaultsResult, distinctResult] = await Promise.all([
    supabase
      .from("service_tag_defaults")
      .select("*")
      .order("display_order", { ascending: true }),
    supabase
      .from("entreprises")
      .select("service_tags")
      .not("service_tags", "is", null),
  ]);

  if (defaultsResult.error) {
    return NextResponse.json({ error: defaultsResult.error.message }, { status: 500 });
  }

  const set = new Set<string>();
  for (const row of (distinctResult.data ?? []) as Array<{ service_tags: unknown }>) {
    const arr = row.service_tags;
    if (Array.isArray(arr)) {
      for (const t of arr) if (typeof t === "string" && t.trim()) set.add(t);
    } else if (typeof arr === "string" && arr.trim()) {
      set.add(arr);
    }
  }
  const inUseTags = Array.from(set).sort((a, b) => a.localeCompare(b));

  return NextResponse.json({
    items: defaultsResult.data ?? [],
    in_use_tags: inUseTags,
  });
}

/**
 * POST /api/service-tag-defaults
 * Body: partial row, at least `service_tag` (required).
 * `slug` is auto-derived from the tag if absent.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const serviceTag = typeof b.service_tag === "string" ? b.service_tag.trim() : "";
  if (!serviceTag) {
    return NextResponse.json({ error: "service_tag required" }, { status: 400 });
  }
  const slug = typeof b.slug === "string" && b.slug.trim() ? b.slug.trim() : slugify(serviceTag);

  const payload = {
    service_tag: serviceTag,
    slug,
    display_label: typeof b.display_label === "string" ? b.display_label : null,
    icon: typeof b.icon === "string" ? b.icon : null,
    display_order: typeof b.display_order === "number" ? b.display_order : 100,
    headline_template: typeof b.headline_template === "string" ? b.headline_template : null,
    subheadline_template: typeof b.subheadline_template === "string" ? b.subheadline_template : null,
    description_template: typeof b.description_template === "string" ? b.description_template : null,
    trust_title_template: typeof b.trust_title_template === "string" ? b.trust_title_template : null,
    image_url: typeof b.image_url === "string" ? b.image_url : null,
    cta_label: typeof b.cta_label === "string" ? b.cta_label : null,
    cta_href: typeof b.cta_href === "string" ? b.cta_href : null,
  };

  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("service_tag_defaults")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Ce tag a déjà un contenu par défaut" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
