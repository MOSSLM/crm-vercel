"use client";

import React from "react";
import type { SectionFontField, StyleGuide } from "@/types";

const GOOGLE_FONTS = [
  "Inter", "Roboto", "Open Sans", "Lato", "Poppins", "Montserrat",
  "Raleway", "Nunito", "Playfair Display", "Merriweather", "Oswald",
  "Source Sans 3", "Ubuntu", "Noto Sans", "PT Sans",
];

interface FontPickerFieldProps {
  setting: SectionFontField;
  value: string;
  onChange: (font: string) => void;
  styleGuide: StyleGuide;
}

export function FontPickerField({ setting, value, onChange, styleGuide }: FontPickerFieldProps) {
  const current = value ?? (setting.default as string) ?? styleGuide.fonts.body;

  // Quick-picks from style guide
  const quickPicks = [
    { label: "Titre (style guide)", value: styleGuide.fonts.heading },
    { label: "Corps (style guide)", value: styleGuide.fonts.body },
  ];

  return (
    <div className="space-y-1.5">
      {/* Quick picks */}
      <div className="flex gap-1">
        {quickPicks.map((q) => (
          <button
            key={q.value}
            onClick={() => onChange(q.value)}
            className={`flex-1 text-[10px] px-2 py-1 rounded border transition-all truncate ${
              current === q.value
                ? "bg-blue-500/20 border-blue-400/50 text-blue-200"
                : "bg-white/5 border-white/10 text-white/50 hover:bg-white/10"
            }`}
            title={q.label}
            style={{ fontFamily: q.value }}
          >
            {q.label}
          </button>
        ))}
      </div>

      {/* Full font list */}
      <select
        value={current}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white/5 border border-white/10 rounded text-white text-xs px-2.5 py-1.5 focus:outline-none focus:border-white/30 appearance-none cursor-pointer"
        style={{
          backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")",
          backgroundPosition: "right 6px center",
          backgroundRepeat: "no-repeat",
          backgroundSize: "16px",
          paddingRight: "28px",
          fontFamily: current,
        }}
      >
        {GOOGLE_FONTS.map((font) => (
          <option key={font} value={font} style={{ fontFamily: font }} className="bg-gray-900">
            {font}
          </option>
        ))}
      </select>

      {/* Preview */}
      <div
        className="px-2.5 py-2 bg-white/5 rounded text-white/70 text-sm border border-white/5"
        style={{ fontFamily: current }}
      >
        Aa — {current}
      </div>
    </div>
  );
}
