"use client";

import React from "react";
import { FONT_SETS, WEIGHT_SETS, CORNER_SETS, type Tweaks } from "@/lib/site-builder/claude-design/apply-tweaks";

const COLORS: Array<{ key: keyof Tweaks; label: string }> = [
  { key: "fond", label: "Fond principal" },
  { key: "fondAlt", label: "Fond secondaire" },
  { key: "sable", label: "Neutre / sable" },
  { key: "sombre", label: "Sombre" },
  { key: "accent", label: "Accent" },
  { key: "accentChaud", label: "Accent chaud" },
];

const POLICE_OPTS = Object.keys(FONT_SETS);
const EPAISSEUR_OPTS = Object.keys(WEIGHT_SETS);
const ANGLES_OPTS = Object.keys(CORNER_SETS);

/** Theme controls mirroring the template's theme-tweaks.jsx panel. */
export function TweaksPanel({ tweaks, onChange }: { tweaks: Tweaks; onChange: (key: string, value: string) => void }) {
  const val = (k: string, d = "") => (typeof tweaks[k] === "string" ? (tweaks[k] as string) : d);
  return (
    <div className="flex flex-col gap-4 text-sm">
      <div>
        <div className="mb-2 font-medium">Couleurs</div>
        <div className="grid grid-cols-2 gap-2">
          {COLORS.map((c) => (
            <label key={c.key as string} className="flex items-center gap-2">
              <input
                type="color"
                className="h-6 w-8 rounded border"
                value={val(c.key as string, "#000000")}
                onChange={(e) => onChange(c.key as string, e.target.value)}
              />
              <span className="text-xs text-muted-foreground">{c.label}</span>
            </label>
          ))}
        </div>
      </div>

      <Select label="Police" value={val("police", "Éditorial")} options={POLICE_OPTS} onChange={(v) => onChange("police", v)} />
      <Select label="Épaisseur" value={val("epaisseur", "Normal")} options={EPAISSEUR_OPTS} onChange={(v) => onChange("epaisseur", v)} />
      <Select label="Angles" value={val("angles", "Doux")} options={ANGLES_OPTS} onChange={(v) => onChange("angles", v)} />
    </div>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <select className="rounded-md border bg-background px-2 py-1 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

export default TweaksPanel;
