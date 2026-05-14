"use client";

import React from "react";
import type {
  SectionField, StyleGuide,
  ButtonFieldValue, LinkFieldValue, InputFieldValue,
  TextareaInputFieldValue, FormFieldValue,
} from "@/types";
import { TextField } from "./TextField";
import { RangeField } from "./RangeField";
import { SelectField } from "./SelectField";
import { CheckboxField } from "./CheckboxField";
import { AlignmentField } from "./AlignmentField";
import { ColorPickerField } from "./ColorPickerField";
import { ColorSchemeField } from "./ColorSchemeField";
import { ImagePickerField } from "./ImagePickerField";
import { FontPickerField } from "./FontPickerField";
import { ButtonField } from "./ButtonField";
import { LinkField } from "./LinkField";
import { InputField, TextareaInputField } from "./InputField";
import { FormField } from "./FormField";
import type { ColorSchemePreset } from "@/lib/color-utils";

interface FieldRendererProps {
  field: SectionField;
  value: unknown;
  onChange: (val: unknown) => void;
  styleGuide: StyleGuide;
  variables?: Record<string, string>;
  siteId?: string;
}

export function FieldRenderer({ field, value, onChange, styleGuide, variables, siteId }: FieldRendererProps) {
  // Non-input separators
  if (field.type === "header") {
    return (
      <div className="pt-3 pb-1 first:pt-0">
        <div className="text-[10px] font-semibold text-white/30 uppercase tracking-widest">{field.content}</div>
      </div>
    );
  }
  if (field.type === "paragraph") {
    return <p className="text-[11px] text-white/40 leading-relaxed">{field.content}</p>;
  }

  // Composite element fields — render their own label inside
  switch (field.type) {
    case "button":
      return (
        <div>
          <div className="text-[11px] text-white/60 mb-1.5">{field.label}</div>
          <ButtonField
            setting={field}
            value={(value as ButtonFieldValue) ?? {}}
            onChange={(v) => onChange(v)}
            variables={variables}
          />
        </div>
      );
    case "link":
      return (
        <div>
          <div className="text-[11px] text-white/60 mb-1.5">{field.label}</div>
          <LinkField
            setting={field}
            value={(value as LinkFieldValue) ?? {}}
            onChange={(v) => onChange(v)}
            variables={variables}
          />
        </div>
      );
    case "input":
      return (
        <div>
          <div className="text-[11px] text-white/60 mb-1.5">{field.label}</div>
          <InputField
            setting={field}
            value={(value as InputFieldValue) ?? {}}
            onChange={(v) => onChange(v)}
            variables={variables}
          />
        </div>
      );
    case "textarea_input":
      return (
        <div>
          <div className="text-[11px] text-white/60 mb-1.5">{field.label}</div>
          <TextareaInputField
            setting={field}
            value={(value as TextareaInputFieldValue) ?? {}}
            onChange={(v) => onChange(v)}
            variables={variables}
          />
        </div>
      );
    case "form":
      return (
        <div>
          <div className="text-[11px] text-white/60 mb-1.5">{field.label}</div>
          <FormField
            setting={field}
            value={(value as FormFieldValue) ?? {}}
            onChange={(v) => onChange(v)}
            variables={variables}
          />
        </div>
      );
  }

  const label = (
    <div className="flex items-start justify-between mb-1.5">
      <label className="text-[11px] text-white/60">{field.label}</label>
      {field.info && (
        <span className="text-[10px] text-white/25 ml-2 leading-tight text-right max-w-[100px]">{field.info}</span>
      )}
    </div>
  );

  let input: React.ReactNode;

  switch (field.type) {
    case "text":
    case "url":
    case "textarea":
    case "richtext":
      input = (
        <TextField
          setting={field}
          value={(value as string) ?? ""}
          onChange={(v) => onChange(v)}
          variables={variables}
        />
      );
      break;

    case "range":
    case "number":
      input = (
        <RangeField
          setting={field}
          value={(value as number) ?? (field.default as number) ?? 0}
          onChange={(v) => onChange(v)}
        />
      );
      break;

    case "select":
    case "radio":
      input = (
        <SelectField
          setting={field}
          value={(value as string) ?? (field.default as string) ?? ""}
          onChange={(v) => onChange(v)}
        />
      );
      break;

    case "checkbox":
      return (
        <div className="flex items-center justify-between py-0.5">
          <label className="text-[11px] text-white/60">{field.label}</label>
          <CheckboxField
            setting={field}
            value={(value as boolean) ?? (field.default as boolean) ?? false}
            onChange={(v) => onChange(v)}
          />
        </div>
      );

    case "alignment":
      input = (
        <AlignmentField
          setting={field}
          value={(value as string) ?? (field.default as string) ?? "left"}
          onChange={(v) => onChange(v)}
        />
      );
      break;

    case "color":
      input = (
        <ColorPickerField
          setting={field}
          value={(value as string) ?? (field.default as string) ?? "#ffffff"}
          onChange={(v) => onChange(v)}
          styleGuide={styleGuide}
        />
      );
      break;

    case "color_scheme":
      input = (
        <ColorSchemeField
          setting={field}
          value={(value as string) ?? "default"}
          onChange={(v: ColorSchemePreset) => onChange(v)}
          styleGuide={styleGuide}
        />
      );
      break;

    case "image_picker":
    case "video_url":
      input = (
        <ImagePickerField
          setting={field}
          value={(value as string) ?? ""}
          onChange={(v) => onChange(v)}
          siteId={siteId}
        />
      );
      break;

    case "font":
      input = (
        <FontPickerField
          setting={field}
          value={(value as string) ?? ""}
          onChange={(v) => onChange(v)}
          styleGuide={styleGuide}
        />
      );
      break;

    default:
      input = (
        <input
          type="text"
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded text-white text-xs px-2.5 py-1.5 focus:outline-none"
        />
      );
  }

  return (
    <div className="space-y-0">
      {label}
      {input}
    </div>
  );
}
