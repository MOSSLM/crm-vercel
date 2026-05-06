"use client";

import React from "react";
import type { SectionSchema, StyleGuide } from "@/types";
import { FieldRenderer } from "./FieldRenderer";

interface SchemaEditorProps {
  schema: SectionSchema;
  content: Record<string, unknown>;
  onUpdate: (key: string, value: unknown) => void;
  styleGuide: StyleGuide;
  /** If provided, only render fields of these types (e.g. 'style' tab filters) */
  filterTypes?: string[];
  /** Exclude fields matching these ids (e.g. '__color_scheme' is handled separately) */
  excludeIds?: string[];
}

export function SchemaEditor({
  schema,
  content,
  onUpdate,
  styleGuide,
  filterTypes,
  excludeIds = [],
}: SchemaEditorProps) {
  const fields = schema.settings.filter((f) => {
    if (excludeIds.includes("id" in f ? f.id : "")) return false;
    if (!filterTypes) return true;
    return filterTypes.includes(f.type);
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
          />
        );
      })}
    </div>
  );
}

/** Separates schema settings into content fields vs style fields */
export function splitSchemaFields(schema: SectionSchema): {
  contentFields: typeof schema.settings;
  styleFields: typeof schema.settings;
} {
  const styleFieldIds = new Set(["__color_scheme", "__padding_y", "text_align"]);
  const styleFieldTypes = new Set(["color_scheme", "color"]);

  const contentFields = schema.settings.filter((f) => {
    const id = "id" in f ? f.id : "";
    if (styleFieldIds.has(id)) return false;
    if (styleFieldTypes.has(f.type)) return false;
    return true;
  });

  const styleFields = schema.settings.filter((f) => {
    const id = "id" in f ? f.id : "";
    if (styleFieldIds.has(id)) return true;
    if (styleFieldTypes.has(f.type)) return true;
    return false;
  });

  return { contentFields, styleFields };
}
