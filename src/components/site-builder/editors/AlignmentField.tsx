"use client";

import React from "react";
import { AlignLeft, AlignCenter, AlignRight, AlignJustify } from "lucide-react";
import type { SectionAlignmentField } from "@/types";

interface AlignmentFieldProps {
  setting: SectionAlignmentField;
  value: string;
  onChange: (val: string) => void;
}

const OPTIONS = [
  { value: "left", icon: AlignLeft, label: "Gauche" },
  { value: "center", icon: AlignCenter, label: "Centré" },
  { value: "right", icon: AlignRight, label: "Droite" },
  { value: "justify", icon: AlignJustify, label: "Justifié" },
];

export function AlignmentField({ setting, value, onChange }: AlignmentFieldProps) {
  const current = value ?? (setting.default as string) ?? "left";

  return (
    <div className="flex gap-1">
      {OPTIONS.map(({ value: v, icon: Icon, label }) => (
        <button
          key={v}
          title={label}
          onClick={() => onChange(v)}
          className={`p-1.5 rounded transition-all border ${
            current === v
              ? "bg-blue-500/30 border-blue-400/60 text-blue-200"
              : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10 hover:text-white/70"
          }`}
        >
          <Icon size={13} />
        </button>
      ))}
    </div>
  );
}
