"use client";

import React from "react";
import type { SectionTextField, SectionTextareaField } from "@/types";

interface TextFieldProps {
  setting: SectionTextField | SectionTextareaField;
  value: string;
  onChange: (val: string) => void;
  variables?: Record<string, string>;
}

export function TextField({ setting, value, onChange, variables }: TextFieldProps) {
  const base =
    "w-full bg-white/5 border border-white/10 rounded text-white text-xs placeholder-white/20 focus:outline-none focus:border-white/30 focus:bg-white/8 transition-colors";

  if (setting.type === "textarea" || setting.type === "richtext") {
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
