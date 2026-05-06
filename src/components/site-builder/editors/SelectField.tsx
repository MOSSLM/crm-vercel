"use client";

import React from "react";
import type { SectionSelectField } from "@/types";

interface SelectFieldProps {
  setting: SectionSelectField;
  value: string;
  onChange: (val: string) => void;
}

export function SelectField({ setting, value, onChange }: SelectFieldProps) {
  const current = value ?? setting.default ?? setting.options[0]?.value ?? "";

  // Use button-group style for radio type or small option sets
  if (setting.type === "radio" || setting.options.length <= 3) {
    return (
      <div className="flex gap-1 flex-wrap">
        {setting.options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`px-2.5 py-1 rounded text-xs transition-all border ${
              current === opt.value
                ? "bg-blue-500/30 border-blue-400/60 text-blue-200"
                : "bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white/80"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <select
      value={current}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-white/5 border border-white/10 rounded text-white text-xs px-2.5 py-1.5 focus:outline-none focus:border-white/30 appearance-none cursor-pointer"
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")", backgroundPosition: "right 6px center", backgroundRepeat: "no-repeat", backgroundSize: "16px", paddingRight: "28px" }}
    >
      {setting.options.map((opt) => (
        <option key={opt.value} value={opt.value} className="bg-gray-900">
          {opt.label}
        </option>
      ))}
    </select>
  );
}
