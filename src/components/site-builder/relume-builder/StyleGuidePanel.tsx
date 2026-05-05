"use client";

import React from "react";
import { X, RefreshCw } from "lucide-react";
import type { StyleGuide } from "@/types";
import { DEFAULT_STYLE_GUIDE } from "@/types";
import { useRelumeBuilder } from "./RelumeBuilderProvider";

const GOOGLE_FONTS = [
  "Inter", "Roboto", "Open Sans", "Lato", "Poppins", "Montserrat",
  "Raleway", "Nunito", "Playfair Display", "Merriweather", "DM Sans",
  "Plus Jakarta Sans", "Sora", "Outfit", "Work Sans",
];

export function StyleGuidePanel() {
  const { state, dispatch } = useRelumeBuilder();
  const sg = state.styleGuide;

  const update = (path: string, value: string) => {
    const parts = path.split(".");
    const partial: Record<string, unknown> = {};
    let cur = partial;
    for (let i = 0; i < parts.length - 1; i++) {
      cur[parts[i]] = {};
      cur = cur[parts[i]] as Record<string, unknown>;
    }
    cur[parts[parts.length - 1]] = value;
    dispatch({ type: "UPDATE_STYLE_GUIDE", payload: partial as Partial<StyleGuide> });
  };

  return (
    <div className="flex flex-col h-full text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <span className="text-sm font-semibold">Style Guide</span>
        <button
          onClick={() => dispatch({ type: "TOGGLE_STYLE_PANEL" })}
          className="text-white/40 hover:text-white/80 transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-6 pt-4">

        {/* ─ Colors ─── */}
        <Section title="Couleurs">
          <ColorRow
            label="Primaire"
            value={sg.colors.primary}
            onChange={(v) => update("colors.primary", v)}
          />
          <ColorRow
            label="Secondaire"
            value={sg.colors.secondary}
            onChange={(v) => update("colors.secondary", v)}
          />
          <ColorRow
            label="Accent"
            value={sg.colors.accent}
            onChange={(v) => update("colors.accent", v)}
          />
          <ColorRow
            label="Fond"
            value={sg.colors.background}
            onChange={(v) => update("colors.background", v)}
          />
          <ColorRow
            label="Fond alt."
            value={sg.colors.backgroundAlt}
            onChange={(v) => update("colors.backgroundAlt", v)}
          />
          <ColorRow
            label="Texte"
            value={sg.colors.text}
            onChange={(v) => update("colors.text", v)}
          />
          <ColorRow
            label="Texte atténué"
            value={sg.colors.textMuted}
            onChange={(v) => update("colors.textMuted", v)}
          />
        </Section>

        {/* ─ Typography ─── */}
        <Section title="Typographie">
          <div className="space-y-3">
            <div>
              <label className="text-xs text-white/50 block mb-1">Police titres</label>
              <select
                value={sg.fonts.heading}
                onChange={(e) => update("fonts.heading", e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50"
              >
                {GOOGLE_FONTS.map((f) => (
                  <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-white/50 block mb-1">Police corps</label>
              <select
                value={sg.fonts.body}
                onChange={(e) => update("fonts.body", e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50"
              >
                {GOOGLE_FONTS.map((f) => (
                  <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-white/50 block mb-1">Taille de base</label>
              <select
                value={sg.fonts.baseSize}
                onChange={(e) => update("fonts.baseSize", e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50"
              >
                {["14px", "15px", "16px", "17px", "18px"].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
        </Section>

        {/* ─ Buttons ─── */}
        <Section title="Boutons">
          <SliderRow
            label="Border radius"
            value={parseInt(sg.buttons.borderRadius)}
            min={0}
            max={32}
            unit="px"
            onChange={(v) => update("buttons.borderRadius", `${v}px`)}
          />
          <div>
            <label className="text-xs text-white/50 block mb-1">Style</label>
            <div className="flex gap-2">
              {(["filled", "outline", "soft"] as const).map((style) => (
                <button
                  key={style}
                  onClick={() => update("buttons.style", style)}
                  className={`flex-1 py-2 text-xs rounded border transition-all ${
                    sg.buttons.style === style
                      ? "border-blue-500 text-blue-400 bg-blue-500/10"
                      : "border-white/10 text-white/40 hover:text-white/60"
                  }`}
                >
                  {style === "filled" ? "Plein" : style === "outline" ? "Contour" : "Doux"}
                </button>
              ))}
            </div>
          </div>
        </Section>

        {/* ─ Cards ─── */}
        <Section title="Cartes">
          <SliderRow
            label="Border radius"
            value={parseInt(sg.cards.borderRadius)}
            min={0}
            max={32}
            unit="px"
            onChange={(v) => update("cards.borderRadius", `${v}px`)}
          />
          <div>
            <label className="text-xs text-white/50 block mb-1">Ombre</label>
            <div className="flex gap-2">
              {(["none", "sm", "md", "lg"] as const).map((sh) => (
                <button
                  key={sh}
                  onClick={() => update("cards.shadow", sh)}
                  className={`flex-1 py-2 text-xs rounded border transition-all ${
                    sg.cards.shadow === sh
                      ? "border-blue-500 text-blue-400 bg-blue-500/10"
                      : "border-white/10 text-white/40 hover:text-white/60"
                  }`}
                >
                  {sh === "none" ? "Aucune" : sh.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </Section>

        {/* ─ Spacing ─── */}
        <Section title="Espacements">
          <SliderRow
            label="Padding sections"
            value={parseInt(sg.spacing.sectionPadding)}
            min={20}
            max={160}
            step={4}
            unit="px"
            onChange={(v) => update("spacing.sectionPadding", `${v}px`)}
          />
          <SliderRow
            label="Gap éléments"
            value={parseInt(sg.spacing.elementGap)}
            min={8}
            max={64}
            step={4}
            unit="px"
            onChange={(v) => update("spacing.elementGap", `${v}px`)}
          />
          <SliderRow
            label="Largeur contenu"
            value={parseInt(sg.spacing.maxContentWidth)}
            min={800}
            max={1600}
            step={40}
            unit="px"
            onChange={(v) => update("spacing.maxContentWidth", `${v}px`)}
          />
        </Section>

        {/* Reset */}
        <button
          onClick={() => dispatch({ type: "UPDATE_STYLE_GUIDE", payload: DEFAULT_STYLE_GUIDE })}
          className="w-full flex items-center justify-center gap-2 py-2 text-xs text-white/40 hover:text-white/70 border border-white/10 hover:border-white/20 rounded-lg transition-all"
        >
          <RefreshCw size={12} />
          Réinitialiser le style
        </button>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">{title}</h4>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <label className="text-xs text-white/60 w-24 flex-shrink-0">{label}</label>
      <div className="flex items-center gap-2 flex-1">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-8 h-8 rounded cursor-pointer border-0 p-0 bg-transparent"
          style={{ appearance: "none" }}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white font-mono focus:outline-none focus:border-blue-500/50"
        />
      </div>
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs text-white/50">{label}</label>
        <span className="text-xs text-white/70 font-mono">{value}{unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-blue-500"
      />
    </div>
  );
}
