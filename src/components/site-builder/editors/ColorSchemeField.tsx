"use client";

import React from "react";
import type { SectionColorSchemeField, StyleGuide } from "@/types";
import { resolveColorScheme, type ColorSchemePreset } from "@/lib/color-utils";

interface ColorSchemeFieldProps {
  setting: SectionColorSchemeField;
  value: string | undefined;
  onChange: (preset: ColorSchemePreset) => void;
  styleGuide: StyleGuide;
}

const PRESETS: { value: ColorSchemePreset; label: string }[] = [
  { value: "default", label: "Défaut" },
  { value: "alt", label: "Alt." },
  { value: "primary", label: "Primaire" },
  { value: "secondary", label: "Secondaire" },
  { value: "dark", label: "Sombre" },
  { value: "light", label: "Clair" },
  { value: "inverted", label: "Inversé" },
];

export function ColorSchemeField({ setting, value, onChange, styleGuide }: ColorSchemeFieldProps) {
  const current = (value as ColorSchemePreset) ?? "default";

  return (
    <div className="grid grid-cols-4 gap-1">
      {PRESETS.map(({ value: preset, label }) => {
        const resolved = resolveColorScheme({ preset }, styleGuide.colors);
        const isActive = current === preset;

        return (
          <button
            key={preset}
            title={label}
            onClick={() => onChange(preset)}
            className={`flex flex-col items-center gap-1 p-1.5 rounded-lg border transition-all ${
              isActive
                ? "border-blue-400/70 ring-1 ring-blue-400/40"
                : "border-white/10 hover:border-white/25"
            }`}
            style={{ backgroundColor: resolved.bg + "33" }}
          >
            {/* Preview swatch */}
            <div
              className="w-full h-6 rounded flex items-center justify-center"
              style={{ backgroundColor: resolved.bg }}
            >
              <div
                className="w-3 h-1 rounded-full"
                style={{ backgroundColor: resolved.text }}
              />
            </div>
            <span className="text-[9px] text-white/50 leading-none">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
