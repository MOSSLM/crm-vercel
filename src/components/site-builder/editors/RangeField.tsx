"use client";

import React from "react";
import type { SectionRangeField, SectionNumberField } from "@/types";

interface RangeFieldProps {
  setting: SectionRangeField | SectionNumberField;
  value: number;
  onChange: (val: number) => void;
}

export function RangeField({ setting, value, onChange }: RangeFieldProps) {
  const min = "min" in setting ? (setting.min ?? 0) : 0;
  const max = "max" in setting ? (setting.max ?? 100) : 100;
  const step = setting.step ?? 1;
  const unit = setting.unit ?? "";
  const numVal = value ?? (setting.default as number) ?? min;

  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={numVal}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 h-1 appearance-none bg-white/10 rounded-full accent-blue-400 cursor-pointer"
      />
      <div className="flex items-center gap-0.5 shrink-0">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={numVal}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!isNaN(v)) onChange(Math.min(max, Math.max(min, v)));
          }}
          className="w-12 bg-white/5 border border-white/10 rounded text-white text-xs text-center px-1 py-0.5 focus:outline-none focus:border-white/30"
        />
        {unit && <span className="text-white/40 text-xs">{unit}</span>}
      </div>
    </div>
  );
}
