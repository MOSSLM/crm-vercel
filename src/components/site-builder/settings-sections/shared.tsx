"use client";

import React from "react";

export const UNIT_OPTIONS = ["px", "%", "rem", "em", "vh", "vw", "auto"] as const;
export type UnitOption = (typeof UNIT_OPTIONS)[number];

export const parseSliderValue = (val: string | number | undefined, fallback = 0): number => {
  if (typeof val === "number") return val;
  if (!val) return fallback;
  const n = parseFloat(String(val).replace(/[^0-9.]/g, ""));
  return isNaN(n) ? fallback : n;
};

export const splitCssValue = (value: string | number | undefined, defaultUnit: UnitOption = "px"): { value: string; unit: UnitOption } => {
  if (value === undefined || value === null || value === "") return { value: "", unit: defaultUnit };
  const raw = String(value).trim();
  if (raw === "auto") return { value: "", unit: "auto" };
  const match = raw.match(/^(-?\d*\.?\d+)\s*([a-zA-Z%]+)?$/);
  if (!match) return { value: raw.replace(/[a-zA-Z%]+$/g, ""), unit: defaultUnit };
  const parsedUnit = match[2] as UnitOption | undefined;
  return { value: match[1], unit: parsedUnit && UNIT_OPTIONS.includes(parsedUnit) ? parsedUnit : defaultUnit };
};

export const ColorInput = ({ value, onChange }: { value?: string; onChange: (val: string) => void }) => (
  <div className="flex items-center gap-2 h-9 rounded-md border border-input bg-background px-2 py-1 cursor-pointer">
    <input
      type="color"
      value={value && value.startsWith("#") ? value : "#000000"}
      onChange={(e) => onChange(e.target.value)}
      className="h-5 w-5 rounded cursor-pointer border-0 bg-transparent p-0 shrink-0"
    />
    <span className="text-xs text-muted-foreground truncate font-mono">{value || "#000000"}</span>
  </div>
);
