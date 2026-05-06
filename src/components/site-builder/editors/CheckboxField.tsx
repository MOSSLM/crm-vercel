"use client";

import React from "react";
import type { SectionCheckboxField } from "@/types";

interface CheckboxFieldProps {
  setting: SectionCheckboxField;
  value: boolean;
  onChange: (val: boolean) => void;
}

export function CheckboxField({ setting, value, onChange }: CheckboxFieldProps) {
  const checked = value ?? (setting.default as boolean) ?? false;

  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors focus:outline-none ${
        checked ? "bg-blue-500" : "bg-white/15"
      }`}
    >
      <span
        className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-3.5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
