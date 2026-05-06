"use client";

import React, { useState, useRef, useEffect } from "react";
import { Check, Copy, ChevronDown } from "lucide-react";
import type { SectionColorField, StyleGuide } from "@/types";
import { generateColorShades, isLightColor } from "@/lib/color-utils";

interface ColorPickerFieldProps {
  setting: SectionColorField;
  value: string;
  onChange: (hex: string) => void;
  styleGuide: StyleGuide;
}

const STOP_NUMBERS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

const STYLE_GUIDE_COLOR_LABELS: Record<string, string> = {
  primary: "Primaire",
  secondary: "Secondaire",
  accent: "Accent",
  background: "Fond",
  backgroundAlt: "Fond alt.",
  text: "Texte",
  textMuted: "Texte doux",
};

export function ColorPickerField({ setting, value, onChange, styleGuide }: ColorPickerFieldProps) {
  const [open, setOpen] = useState(false);
  const [expandedColor, setExpandedColor] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const currentHex = value || (setting.default as string) || "#ffffff";

  function copyHex() {
    navigator.clipboard.writeText(currentHex).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  }

  const colorEntries = Object.entries(styleGuide.colors) as [string, string][];

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full bg-white/5 border border-white/10 rounded px-2.5 py-1.5 hover:bg-white/8 hover:border-white/20 transition-colors"
      >
        <span
          className="w-5 h-5 rounded border border-white/20 shrink-0"
          style={{ backgroundColor: currentHex }}
        />
        <span className="text-xs text-white/70 flex-1 text-left font-mono">{currentHex}</span>
        <ChevronDown size={12} className={`text-white/30 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Popover */}
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 w-64 bg-[#1a1a2e] border border-white/10 rounded-xl shadow-2xl p-3 space-y-3">
          {/* Current color preview */}
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg border border-white/20"
              style={{ backgroundColor: currentHex }}
            />
            <div className="flex-1">
              <input
                type="text"
                value={currentHex}
                onChange={(e) => {
                  const v = e.target.value;
                  if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v);
                }}
                className="w-full bg-transparent text-white/80 text-xs font-mono focus:outline-none border-b border-white/10 pb-0.5"
              />
            </div>
            <button onClick={copyHex} className="text-white/30 hover:text-white/70 transition-colors p-1">
              {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
            </button>
            {/* Native color input hidden behind a custom button */}
            <label className="cursor-pointer">
              <input
                type="color"
                value={currentHex}
                onChange={(e) => onChange(e.target.value)}
                className="sr-only"
              />
              <span className="block w-5 h-5 rounded border border-white/20 bg-gradient-to-br from-red-400 via-green-400 to-blue-400 cursor-pointer" title="Couleur personnalisée" />
            </label>
          </div>

          {/* Style guide palette */}
          <div className="space-y-2">
            <div className="text-[10px] text-white/30 uppercase tracking-wider font-medium">Palette Style Guide</div>
            {colorEntries.map(([key, hex]) => {
              const shades = generateColorShades(hex);
              const isExpanded = expandedColor === key;
              return (
                <div key={key}>
                  {/* Base color row */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { onChange(hex); setOpen(false); }}
                      className="w-5 h-5 rounded border border-white/20 shrink-0 hover:scale-110 transition-transform"
                      style={{ backgroundColor: hex }}
                      title={hex}
                    />
                    <span className="text-[11px] text-white/50 flex-1">{STYLE_GUIDE_COLOR_LABELS[key] ?? key}</span>
                    <button
                      onClick={() => setExpandedColor(isExpanded ? null : key)}
                      className="text-white/20 hover:text-white/50 transition-colors"
                    >
                      <ChevronDown size={11} className={`transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                    </button>
                  </div>

                  {/* Shades strip */}
                  {isExpanded && (
                    <div className="flex gap-0.5 mt-1.5 ml-7">
                      {STOP_NUMBERS.map((stop) => {
                        const shadeHex = shades[stop];
                        return (
                          <button
                            key={stop}
                            title={`${key}-${stop}: ${shadeHex}`}
                            onClick={() => { onChange(shadeHex); setOpen(false); }}
                            className="flex-1 h-5 rounded-sm border border-transparent hover:border-white/40 hover:scale-y-110 transition-all"
                            style={{ backgroundColor: shadeHex }}
                          />
                        );
                      })}
                    </div>
                  )}
                  {isExpanded && (
                    <div className="flex gap-0.5 ml-7 mt-0.5">
                      {STOP_NUMBERS.map((stop) => (
                        <div key={stop} className="flex-1 text-center text-[7px] text-white/20">{stop}</div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
