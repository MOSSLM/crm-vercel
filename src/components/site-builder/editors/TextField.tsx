"use client";

import React from "react";
import type { SectionTextField, SectionTextareaField } from "@/types";
import { VariableTextarea } from "@/components/site-builder/relume-builder/VariableTextarea";

interface TextFieldProps {
  setting: SectionTextField | SectionTextareaField;
  value: string;
  onChange: (val: string) => void;
  variables?: Record<string, string>;
}

export function TextField({ setting, value, onChange, variables }: TextFieldProps) {
  const base =
    "w-full bg-white/5 border border-white/10 rounded text-white text-xs placeholder-white/20 focus:outline-none focus:border-white/30 focus:bg-white/8 transition-colors";
  const hasVars = variables && Object.keys(variables).length > 0;

  if (setting.type === "textarea" || setting.type === "richtext") {
    if (hasVars) {
      return (
        <VariableTextarea
          value={value ?? ""}
          onChange={onChange}
          placeholder={setting.placeholder ?? ""}
          rows={setting.rows ?? 3}
          className={`${base} px-2.5 py-2 resize-none`}
          variables={variables}
          variant="dark"
        />
      );
    }
    return (
      <textarea
        className={`${base} px-2.5 py-2 resize-none`}
        rows={setting.rows ?? 3}
        value={value ?? ""}
        placeholder={setting.placeholder ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  // Single-line: show variable picker only for text type (not url)
  if (setting.type === "text" && hasVars) {
    return (
      <VariableTextarea
        value={value ?? ""}
        onChange={onChange}
        placeholder={setting.placeholder ?? ""}
        rows={1}
        className={`${base} px-2.5 py-1.5 resize-none`}
        variables={variables}
        variant="dark"
      />
    );
  }

  return (
    <input
      type={setting.type === "url" ? "url" : "text"}
      className={`${base} px-2.5 py-1.5`}
      value={value ?? ""}
      placeholder={setting.placeholder ?? ""}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
