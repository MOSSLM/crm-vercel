"use client";

import React from "react";
import { Check } from "lucide-react";
import type { TweakControl } from "@/lib/site-builder/claude-design/parse-tweaks-schema";

/**
 * Faithful reproduction of the template's own Tweaks panel: preset color
 * swatches (no native color picker), selects and per-page radios, driven by the
 * schema extracted from the template's *-tweaks.jsx (parse-tweaks-schema).
 */
export function TweaksPanel({
  controls,
  tweaks,
  onChange,
}: {
  controls: TweakControl[];
  tweaks: Record<string, unknown>;
  onChange: (key: string, value: string) => void;
}) {
  const val = (k: string, d = "") => (typeof tweaks[k] === "string" ? (tweaks[k] as string) : d);

  if (controls.length === 0) {
    return <p className="text-xs text-muted-foreground">Aucun réglage de thème pour ce template.</p>;
  }

  // Group consecutive controls under their <TweakSection> header.
  const groups: Array<{ group?: string; items: TweakControl[] }> = [];
  for (const c of controls) {
    const last = groups[groups.length - 1];
    if (last && last.group === c.group) last.items.push(c);
    else groups.push({ group: c.group, items: [c] });
  }

  return (
    <div className="flex flex-col gap-4 text-sm">
      {groups.map((g, gi) => (
        <div key={gi} className="flex flex-col gap-3">
          {g.group && (
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{g.group}</div>
          )}
          {g.items.map((c) => (
            <Control key={c.key} control={c} value={val(c.key, c.options[0] ?? "")} onChange={(v) => onChange(c.key, v)} />
          ))}
        </div>
      ))}
    </div>
  );
}

function Control({ control, value, onChange }: { control: TweakControl; value: string; onChange: (v: string) => void }) {
  if (control.type === "color") {
    return (
      <div>
        <div className="mb-1.5 text-xs text-muted-foreground">{control.label}</div>
        <div className="flex flex-wrap gap-1.5">
          {control.options.map((hex) => {
            const selected = value.toLowerCase() === hex.toLowerCase();
            return (
              <button
                key={hex}
                title={hex}
                onClick={() => onChange(hex)}
                className={`relative h-7 w-7 rounded-md border ${selected ? "ring-2 ring-offset-1 ring-primary" : "border-black/10"}`}
                style={{ backgroundColor: hex }}
              >
                {selected && <Check className="absolute inset-0 m-auto h-3.5 w-3.5 text-white mix-blend-difference" />}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (control.type === "radio") {
    return (
      <div>
        <div className="mb-1.5 text-xs text-muted-foreground">{control.label}</div>
        <div className="inline-flex flex-wrap gap-1 rounded-md bg-muted p-0.5">
          {control.options.map((o) => (
            <button
              key={o}
              onClick={() => onChange(o)}
              className={`rounded px-2.5 py-1 text-xs ${value === o ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {o}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // select
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{control.label}</span>
      <select className="rounded-md border bg-background px-2 py-1 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
        {control.options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

export default TweaksPanel;
