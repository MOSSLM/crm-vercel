import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-service";

/**
 * Removes rogue `export default function Schema(...)` blocks and deduplicates
 * multiple `export default` declarations, keeping only the first one.
 */
function sanitizeCode(code: string): string {
  // Remove export default function Schema blocks (including body)
  let result = code.replace(
    /export\s+default\s+function\s+Schema\s*\([^)]*\)\s*\{[^]*?\n\}/gm,
    ""
  );

  // If there are still multiple export default function/class/identifier, keep only first
  const exportDefaultRegex = /export\s+default\s+(?:function\s+\w+|class\s+\w+|\w+)/g;
  const matches = [...result.matchAll(exportDefaultRegex)];
  if (matches.length > 1) {
    // Strip all but the first occurrence
    let skipped = 0;
    result = result.replace(exportDefaultRegex, (match) => {
      skipped++;
      return skipped === 1 ? match : match.replace(/^export\s+default\s+/, "");
    });
  }

  return result.trim();
}

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string; sectionId: string }> };

// GET /api/themes/[slug]/sections/[sectionId]
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { slug, sectionId } = await params;
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from("theme_sections")
    .select("*")
    .eq("theme_slug", slug)
    .eq("section_id", sectionId)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

// PATCH /api/themes/[slug]/sections/[sectionId]
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { slug, sectionId } = await params;
  const body = await req.json();
  const supabase = getSupabaseServiceClient();

  const allowed = ["name", "category", "code", "example_data", "sort_order", "section_id", "schema"];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  // Sanitize code: remove duplicate export default function Schema blocks
  if (typeof updates.code === "string") {
    updates.code = sanitizeCode(updates.code);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("theme_sections")
    .update(updates)
    .eq("theme_slug", slug)
    .eq("section_id", sectionId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE /api/themes/[slug]/sections/[sectionId]
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { slug, sectionId } = await params;
  const supabase = getSupabaseServiceClient();

  const { error } = await supabase
    .from("theme_sections")
    .delete()
    .eq("theme_slug", slug)
    .eq("section_id", sectionId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
