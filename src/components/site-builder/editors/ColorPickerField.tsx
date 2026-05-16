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

function isValidHex(hex: string): boolean {
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(hex);
}

function splitHexAlpha(hex: string): { solid: string; alpha: number } {
  if (!hex) return { solid: "#000000", alpha: 1 };
  if (hex.length === 9) {
    const solid = hex.slice(0, 7);
    const aa = hex.slice(7, 9);
    const alpha = parseInt(aa, 16) / 255;
    return { solid, alpha: isNaN(alpha) ? 1 : alpha };
  }
  return { solid: hex, alpha: 1 };
}

function composeHexAlpha(solid: string, alpha: number): string {
  if (!isValidHex(solid)) return solid;
  const clamped = Math.max(0, Math.min(1, alpha));
  if (clamped >= 1) return solid.length === 9 ? solid.slice(0, 7) : solid;
  const aa = Math.round(clamped * 255).toString(16).padStart(2, "0");
  const base = solid.length === 9 ? solid.slice(0, 7) : solid;
  return `${base}${aa}`;
}

/** Color chip with checker pattern visible when alpha < 1. */
function ColorChip({ value, size = 22 }: { value: string; size?: number }) {
  return (
    <div
      style={{
        display: "inline-block",
        width: size,
        height: size,
        boxSizing: "border-box",
        borderRadius: size <= 22 ? 5 : 6,
        flexShrink: 0,
        flexGrow: 0,
        border: "1.5px solid var(--surface)",
        boxShadow: "0 0 0 1px var(--border-2), 0 1px 2px rgba(20,18,14,.06)",
        backgroundImage:
          `linear-gradient(${value}, ${value}), ` +
          "conic-gradient(rgba(20,18,14,.14) 25%, transparent 0 50%, rgba(20,18,14,.14) 0 75%, transparent 0)",
        backgroundSize: "100% 100%, 8px 8px",
      }}
    />
  );
}

export function ColorPickerField({ setting, value, onChange, styleGuide }: ColorPickerFieldProps) {
  const [open, setOpen] = useState(false);
  const [expandedColor, setExpandedColor] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  useEffect(() => { setDraft(value); }, [value]);

  const currentHex = value || (setting.default as string) || "#ffffff";
  const { solid, alpha } = splitHexAlpha(currentHex);

  function copyHex() {
    navigator.clipboard.writeText(currentHex).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  }

  const commit = (v: string) => {
    const trimmed = v.trim();
    const clean = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
    if (isValidHex(clean)) { onChange(clean); setDraft(clean); }
    else setDraft(value);
  };

  const setSolid = (s: string) => onChange(composeHexAlpha(s, alpha));
  const setAlpha = (a: number) => onChange(composeHexAlpha(solid, a));

  const colorEntries = Object.entries(styleGuide.colors) as [string, string][];

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Trigger */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="input"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          height: 28,
          padding: "0 8px",
          textAlign: "left",
          cursor: "default",
        }}
      >
        <ColorChip value={currentHex} size={18} />
        <span style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {currentHex}
        </span>
        <ChevronDown size={11} style={{ color: "var(--text-4)", transform: open ? "rotate(180deg)" : undefined, transition: "transform .15s" }} />
      </button>

      {/* Popover */}
      {open && (
        <div
          className="pop"
          style={{
            position: "absolute",
            zIndex: 60,
            top: "100%",
            left: 0,
            marginTop: 4,
            width: 260,
            padding: 10,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {/* Hex input + copy */}
          <div className="hex-input-row">
            <ColorChip value={currentHex} size={28} />
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={(e) => commit(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") commit((e.target as HTMLInputElement).value); }}
              className="input mono"
              spellCheck={false}
              style={{ flex: 1, minWidth: 0, height: 28 }}
            />
            <button onClick={copyHex} className="btn ghost xs icon" title="Copier">
              {copied ? <Check size={11} style={{ color: "var(--ok)" }} /> : <Copy size={11} />}
            </button>
          </div>

          {/* Opacity slider */}
          <div className="range-row">
            <label style={{ fontSize: 10.5, color: "var(--text-4)", width: 56, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: ".04em" }}>Opacité</label>
            <input
              type="range" min={0} max={100} value={Math.round(alpha * 100)}
              onChange={(e) => setAlpha(Number(e.target.value) / 100)}
            />
            <span className="val" style={{ fontSize: 10.5, width: 38 }}>{Math.round(alpha * 100)}%</span>
          </div>

          {/* Style guide palette */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
            <div style={{ fontSize: 10, color: "var(--text-4)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: ".06em" }}>
              Palette Style Guide
            </div>
            {colorEntries.map(([key, hex]) => {
              const shades = generateColorShades(hex);
              const isExpanded = expandedColor === key;
              return (
                <div key={key}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                      onClick={() => { onChange(hex); setOpen(false); }}
                      title={hex}
                      style={{
                        width: 18, height: 18,
                        borderRadius: 4, flexShrink: 0,
                        background: hex, border: "1px solid var(--border-2)",
                        cursor: "default",
                      }}
                    />
                    <span style={{ flex: 1, fontSize: 11, color: "var(--text-2)" }}>
                      {STYLE_GUIDE_COLOR_LABELS[key] ?? key}
                    </span>
                    <button
                      onClick={() => setExpandedColor(isExpanded ? null : key)}
                      className="btn ghost xs icon"
                      style={{ width: 18, height: 18 }}
                      title="Nuances"
                    >
                      <ChevronDown size={10} style={{ transform: isExpanded ? "rotate(180deg)" : undefined, transition: "transform .15s" }} />
                    </button>
                  </div>
                  {isExpanded && (
                    <div className="shade-strip" style={{ marginTop: 4, height: 18 }}>
                      {STOP_NUMBERS.map((stop) => {
                        const shadeHex = shades[stop];
                        return (
                          <button
                            key={stop}
                            title={`${key}-${stop}: ${shadeHex}`}
                            onClick={() => { onChange(shadeHex); setOpen(false); }}
                            style={{
                              flex: 1,
                              background: shadeHex,
                              appearance: "none",
                              border: 0,
                              cursor: "default",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: isLightColor(shadeHex) ? "#000" : "#fff",
                              fontSize: 7,
                            }}
                          >
                            {stop === 500 && "•"}
                          </button>
                        );
                      })}
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
