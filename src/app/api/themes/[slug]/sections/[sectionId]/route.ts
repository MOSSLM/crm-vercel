import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";

function sanitizeCode(code: string): string {
  let result = code.replace(
    /export\s+default\s+function\s+Schema\s*\([^)]*\)\s*\{[^]*?\n\}/gm,
    "",
  );

  const exportDefaultRegex = /export\s+default\s+(?:function\s+\w+|class\s+\w+|\w+)/g;
  const matches = [...result.matchAll(exportDefaultRegex)];
  if (matches.length > 1) {
    let skipped = 0;
    result = result.replace(exportDefaultRegex, (match) => {
      skipped++;
      return skipped === 1 ? match : match.replace(/^export\s+default\s+/, "");
    });
  }

  return result.trim();
}

export const dynamic = "force-dynamic";

type Params = { slug: string; sectionId: string };

export const GET = withAuth<undefined, Params>({}, async ({ params }) => {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from("theme_sections")
    .select("*")
    .eq("theme_slug", params.slug)
    .eq("section_id", params.sectionId)
    .single();

  if (error) return jsonError(error.message, 404);
  return json(data);
});

export const PATCH = withAuth<undefined, Params>({}, async ({ req, params }) => {
  const body = await req.json();
  const supabase = getServiceClient();

  const allowed = ["name", "category", "code", "example_data", "sort_order", "section_id", "schema", "is_tag_adaptive"];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  if (typeof updates.code === "string") {
    updates.code = sanitizeCode(updates.code);
  }

  if (Object.keys(updates).length === 0) return jsonError("Nothing to update", 400);

  const { data, error } = await supabase
    .from("theme_sections")
    .update(updates)
    .eq("theme_slug", params.slug)
    .eq("section_id", params.sectionId)
    .select()
    .single();

  if (error) return jsonError(error.message, 500);
  return json(data);
});

export const DELETE = withAuth<undefined, Params>({}, async ({ params }) => {
  const supabase = getServiceClient();

  const { error } = await supabase
    .from("theme_sections")
    .delete()
    .eq("theme_slug", params.slug)
    .eq("section_id", params.sectionId);

  if (error) return jsonError(error.message, 500);
  return new Response(null, { status: 204 });
});
