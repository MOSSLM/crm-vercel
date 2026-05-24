import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";

export const dynamic = "force-dynamic";

type Params = { slug: string };

export const GET = withAuth<undefined, Params>({}, async ({ params }) => {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from("theme_sections")
    .select("*")
    .eq("theme_slug", params.slug)
    .order("category", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("section_id", { ascending: true });

  if (error) return jsonError(error.message, 500);
  return json(data ?? []);
});

export const POST = withAuth<undefined, Params>({}, async ({ req, params }) => {
  const body = await req.json();
  const { section_id, category, name, code, example_data, schema, is_tag_adaptive } = body;

  if (!section_id || !category || !name) {
    return jsonError("section_id, category and name are required", 400);
  }

  const supabase = getServiceClient();
  const adaptive = is_tag_adaptive === true;
  const resolvedCode =
    code ?? (adaptive ? getDefaultAdaptiveCode(section_id) : getDefaultCode(section_id));
  const resolvedSchema = schema ?? (adaptive ? getDefaultAdaptiveSchema(name) : null);

  const { data, error } = await supabase
    .from("theme_sections")
    .insert({
      theme_slug: params.slug,
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
      return jsonError(`Une section "${section_id}" existe déjà pour ce thème`, 409);
    }
    return jsonError(error.message, 500);
  }

  return json(data, { status: 201 });
});

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
