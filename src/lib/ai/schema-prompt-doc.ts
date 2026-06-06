import type { SectionField, SectionSchema } from "@/types";
import { SECTION_SCHEMAS } from "@/data/section-schemas";

/**
 * Builds a markdown reference describing every available section type and
 * its editable schema. The output is injected into the system prompt of the
 * site-config generator so the AI emits content keyed by the actual schema
 * field IDs (e.g. `heading`, not `title`) and uses the proper `blocks` shape.
 *
 * Designed to stay compact — overly verbose docs eat the prompt budget and
 * confuse the model. We expose: section name, type id, description, the
 * editable settings (id, type, allowed values, defaults), and the supported
 * blocks (with their settings). Presets are listed by name only.
 */

function describeField(f: SectionField): string {
  if (f.type === "header" || f.type === "paragraph") return "";
  const id = (f as { id: string }).id;
  const required = (f as { required?: boolean }).required ? " (requis)" : "";
  const def = f.default !== undefined ? ` [défaut: ${JSON.stringify(f.default)}]` : "";

  switch (f.type) {
    case "select":
    case "radio": {
      const opts = (f as { options: { value: string; label: string }[] }).options
        .map((o) => o.value)
        .join("|");
      return `  - ${id} (${f.type}: ${opts})${required}${def}`;
    }
    case "range":
    case "number": {
      const min = (f as { min?: number }).min;
      const max = (f as { max?: number }).max;
      const unit = (f as { unit?: string }).unit ? ` ${(f as { unit: string }).unit}` : "";
      return `  - ${id} (${f.type}: ${min ?? "?"}–${max ?? "?"}${unit})${required}${def}`;
    }
    case "color_scheme":
      return `  - ${id} (color_scheme: default|alt|primary|secondary|dark|light|inverted)${def}`;
    case "checkbox":
      return `  - ${id} (boolean)${def}`;
    case "page_link":
      return `  - ${id} (page_link: chemin interne ou URL externe)${required}${def}`;
    case "icon_picker":
      return `  - ${id} (icon: nom Lucide, ex: "star", "zap")${def}`;
    case "enterprise_field":
      return `  - ${id} (enterprise_field: clé sous entreprise.*, ex: "telephone")${def}`;
    case "review_source":
      return `  - ${id} (review_source: google|config|static)${def}`;
    case "social_links": {
      const platforms = (f as { platforms?: string[] }).platforms ?? ["facebook", "instagram", "linkedin", "twitter"];
      return `  - ${id} (object {${platforms.join(", ")}})`;
    }
    default:
      return `  - ${id} (${f.type})${required}${def}`;
  }
}

function describeSchema(typeId: string, schema: SectionSchema): string {
  const lines: string[] = [];
  lines.push(`### ${typeId} — ${schema.name}`);
  if (schema.description) lines.push(schema.description);
  if (schema.limits?.instances_per_page === 1) {
    lines.push(`_Limite : 1 instance par page._`);
  }

  const settingsLines = schema.settings.map(describeField).filter(Boolean);
  if (settingsLines.length > 0) {
    lines.push("Champs (`content`):");
    lines.push(...settingsLines);
  }

  if (schema.blocks && schema.blocks.length > 0) {
    lines.push(`Blocs (\`blocks[]\`)${schema.max_blocks ? `, max ${schema.max_blocks}` : ""}:`);
    for (const b of schema.blocks) {
      const limit = b.limit ? ` (max ${b.limit})` : "";
      lines.push(`- type: \`${b.type}\` — ${b.name}${limit}`);
      const blockFields = b.settings.map(describeField).filter(Boolean);
      lines.push(...blockFields.map((l) => `  ${l}`));
    }
  }

  if (schema.presets && schema.presets.length > 0) {
    const names = schema.presets.map((p) => `"${p.name}"`).join(", ");
    lines.push(`Presets disponibles : ${names}`);
  }

  return lines.join("\n");
}

/**
 * Returns a markdown block listing every section the AI can use, derived
 * directly from the schema registry. Aliases (multiple keys pointing to the
 * same schema) are deduplicated by referenced schema identity, with the
 * canonical (shortest) key preserved.
 */
export function buildSectionsPromptDoc(typeFilter?: Set<string>): string {
  const seen = new Map<SectionSchema, string>();
  for (const [key, schema] of Object.entries(SECTION_SCHEMAS)) {
    if (typeFilter && !typeFilter.has(key)) continue;
    const existing = seen.get(schema);
    if (!existing || key.length < existing.length) seen.set(schema, key);
  }

  const blocks: string[] = [];
  for (const [schema, key] of seen.entries()) {
    blocks.push(describeSchema(key, schema));
  }
  return blocks.join("\n\n");
}

/**
 * Resolves placeholders inside a system prompt template.
 * Supported tokens: {{SECTIONS_DOC}}.
 */
export function resolvePromptTemplate(template: string): string {
  return template.replace("{{SECTIONS_DOC}}", buildSectionsPromptDoc());
}
