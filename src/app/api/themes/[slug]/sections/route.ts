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
  const { section_id, category, name, code, example_data, schema, is_tag_adaptive } = body;

  if (!section_id || !category || !name) {
    return NextResponse.json(
      { error: "section_id, category and name are required" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseServiceClient();

  const adaptive = is_tag_adaptive === true;
  const resolvedCode =
    code ?? (adaptive ? getDefaultAdaptiveCode(section_id) : getDefaultCode(section_id));
  const resolvedSchema = schema ?? (adaptive ? getDefaultAdaptiveSchema(name) : null);

  const { data, error } = await supabase
    .from("theme_sections")
    .insert({
      theme_slug: slug,
      section_id,
      category,
      name,
      code: resolvedCode,
      example_data: example_data ?? {},
      schema: resolvedSchema,
      is_tag_adaptive: adaptive,
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

/**
 * Starter code for a tag-adaptive section: renders one card per item in
 * `data.items` (the array is materialised by the builder, one entry per
 * enterprise service_tag). The layout stays correct for any item count.
 */
function getDefaultAdaptiveCode(sectionId: string): string {
  return `import React from 'react';

interface Props {
  tokens?: Record<string, string>;
  data?: Record<string, unknown>;
  variables?: Record<string, string>;
}

interface Item {
  title?: string;
  description?: string;
  image?: string;
  service_tag?: string;
}

export default function ${toPascalCase(sectionId)}({ tokens = {}, data = {}, variables = {} }: Props) {
  // data.items is the repeatable list — one entry per enterprise service tag.
  const items = (data.items as Item[]) ?? [];
  const eyebrow = (data.eyebrow as string) || '';
  const heading = (data.heading as string) || 'Nos services';
  const subheading = (data.subheading as string) || '';

  return (
    <section style={{ backgroundColor: 'var(--color-background)', padding: 'var(--section-padding)' }}>
      <div style={{ maxWidth: 'var(--max-content-width)', margin: '0 auto' }} className="px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mb-10">
          {eyebrow && (
            <p className="text-xs font-bold uppercase tracking-widest mb-3"
               style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-body)' }}>
              {eyebrow}
            </p>
          )}
          <h2 className="text-3xl sm:text-4xl font-bold mb-4 leading-tight"
              style={{ color: 'var(--color-text)', fontFamily: 'var(--font-heading)' }}>
            {heading}
          </h2>
          {subheading && (
            <p className="text-base sm:text-lg leading-relaxed"
               style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)' }}>
              {subheading}
            </p>
          )}
        </div>

        {/* Repeatable item — rendered once per service tag */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((item, index) => (
            <div key={index} className="flex flex-col overflow-hidden"
                 style={{ backgroundColor: 'var(--color-bg-alt)', boxShadow: 'var(--card-shadow)', borderRadius: 'var(--card-radius)' }}>
              {item.image && (
                <img src={item.image} alt={item.title || ''} className="w-full object-cover"
                     style={{ maxHeight: 200 }} loading="lazy" />
              )}
              <div className="flex flex-col gap-3" style={{ padding: 'var(--card-padding)' }}>
                <span className="text-xs font-bold tabular-nums" style={{ color: 'var(--color-accent)' }}>
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h3 className="text-xl font-bold"
                    style={{ color: 'var(--color-text)', fontFamily: 'var(--font-heading)' }}>
                  {item.title}
                </h3>
                <p className="text-sm leading-relaxed"
                   style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)' }}>
                  {item.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
`;
}

/** Starter schema for a tag-adaptive section: section-level settings plus a
 *  single `tag_item` block — the template duplicated per service tag. */
function getDefaultAdaptiveSchema(name: string): Record<string, unknown> {
  return {
    name,
    description: "Section adaptative — un élément répété par service de l'entreprise.",
    category: "content",
    settings: [
      { type: "text", id: "eyebrow", label: "Sur-titre", default: "", group: "content" },
      { type: "text", id: "heading", label: "Titre", default: "Nos services", group: "content" },
      { type: "textarea", id: "subheading", label: "Sous-titre", default: "", group: "content" },
    ],
    blocks: [
      {
        type: "tag_item",
        name: "Service",
        icon: "briefcase",
        settings: [
          { type: "text", id: "title", label: "Titre", default: "" },
          { type: "textarea", id: "description", label: "Description", default: "" },
          { type: "image_picker", id: "image", label: "Image", default: "" },
        ],
      },
    ],
  };
}

function toPascalCase(str: string): string {
  return str.replace(/(?:^|[-_])(\w)/g, (_, c) => c.toUpperCase());
}
