import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

// GET /api/themes/[slug]/sections — list all sections for a theme
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from("theme_sections")
    .select("*")
    .eq("theme_slug", slug)
    .order("category", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("section_id", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}

// POST /api/themes/[slug]/sections — create a new section
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const body = await req.json();
  const { section_id, category, name, code, example_data } = body;

  if (!section_id || !category || !name) {
    return NextResponse.json(
      { error: "section_id, category and name are required" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from("theme_sections")
    .insert({
      theme_slug: slug,
      section_id,
      category,
      name,
      code: code ?? getDefaultCode(section_id),
      example_data: example_data ?? {},
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: `Une section "${section_id}" existe déjà pour ce thème` },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

function getDefaultCode(sectionId: string): string {
  return `import React from 'react';

interface Props {
  tokens?: Record<string, string>;
  data?: Record<string, unknown>;
  variables?: Record<string, string>;
}

export default function ${toPascalCase(sectionId)}({ tokens = {}, data = {}, variables = {} }: Props) {
  return (
    <section className="py-16 px-8">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-8">
          {(variables['entreprise.nom'] as string) || '${sectionId}'}
        </h2>
        <p className="text-center text-gray-600">
          Éditez cette section dans l'éditeur de code.
        </p>
      </div>
    </section>
  );
}
`;
}

function toPascalCase(str: string): string {
  return str.replace(/(?:^|[-_])(\w)/g, (_, c) => c.toUpperCase());
}
