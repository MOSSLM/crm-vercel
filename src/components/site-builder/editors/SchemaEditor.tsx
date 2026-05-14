"use client";

import React from "react";
import type { SectionSchema, StyleGuide, SectionFieldGroup } from "@/types";
import { FieldRenderer } from "./FieldRenderer";
import { isFieldVisible } from "@/data/section-schemas";

interface SchemaEditorProps {
  schema: SectionSchema;
  content: Record<string, unknown>;
  onUpdate: (key: string, value: unknown) => void;
  styleGuide: StyleGuide;
  /** If provided, only render fields of these types (e.g. 'style' tab filters) */
  filterTypes?: string[];
  /** Exclude fields matching these ids (e.g. '__color_scheme' is handled separately) */
  excludeIds?: string[];
  variables?: Record<string, string>;
  siteId?: string;
}

export function SchemaEditor({
  schema,
  content,
  onUpdate,
  styleGuide,
  filterTypes,
  excludeIds = [],
  variables,
  siteId,
}: SchemaEditorProps) {
  const fields = schema.settings.filter((f) => {
    if (excludeIds.includes("id" in f ? f.id : "")) return false;
    if (filterTypes && !filterTypes.includes(f.type)) return false;
    if (!isFieldVisible(f, content)) return false;
    return true;
  });

  if (fields.length === 0) return null;

  return (
    <div className="space-y-3">
      {fields.map((field, i) => {
        const id = "id" in field ? field.id : `__${i}`;
        return (
          <FieldRenderer
            key={id}
            field={field}
            value={content[id]}
            onChange={(val) => onUpdate(id, val)}
            styleGuide={styleGuide}
            variables={variables}
            siteId={siteId}
          />
        );
      })}
    </div>
  );
}

/**
 * Separates schema settings into buckets keyed by `group`. Falls back to
 * legacy id-based detection so older schemas without `group` still split
 * cleanly between Contenu / Style.
 */
export function splitSchemaFields(schema: SectionSchema): {
  contentFields: typeof schema.settings;
  styleFields: typeof schema.settings;
  layoutFields: typeof schema.settings;
} {
  const styleIdHints = new Set(["__color_scheme", "__padding_y"]);
  const styleTypeHints = new Set(["color_scheme", "color"]);
  const layoutIdHints = new Set(["text_align"]);

  const groupOf = (f: typeof schema.settings[number]): SectionFieldGroup | null => {
    if ("group" in f && f.group) return f.group;
    const id = "id" in f ? f.id : "";
    if (styleIdHints.has(id) || styleTypeHints.has(f.type)) return "style";
    if (layoutIdHints.has(id)) return "layout";
    return null;
  };

  // Headers are sticky to whatever group their following field lives in.
  // We compute a derived group for each entry so a "Style" header carrying
  // no explicit group still ends up in the Style bucket.
  const settings = schema.settings;
  const derivedGroup: (SectionFieldGroup | null)[] = settings.map(() => null);

  for (let i = 0; i < settings.length; i++) {
    const f = settings[i];
    if (f.type === "header" || f.type === "paragraph") {
      // Lookahead: copy the group of the next non-header field
      let g: SectionFieldGroup | null = null;
      for (let j = i + 1; j < settings.length; j++) {
        const next = settings[j];
        if (next.type === "header" || next.type === "paragraph") continue;
        g = groupOf(next);
        break;
      }
      derivedGroup[i] = ("group" in f && f.group) ? f.group : g;
    } else {
      derivedGroup[i] = groupOf(f);
    }
  }

  const contentFields: typeof schema.settings = [];
  const styleFields: typeof schema.settings = [];
  const layoutFields: typeof schema.settings = [];

  for (let i = 0; i < settings.length; i++) {
    const g = derivedGroup[i];
    if (g === "style") styleFields.push(settings[i]);
    else if (g === "layout") layoutFields.push(settings[i]);
    else contentFields.push(settings[i]);
  }

  return { contentFields, styleFields, layoutFields };
}
