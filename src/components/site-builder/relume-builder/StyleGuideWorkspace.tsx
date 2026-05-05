"use client";

import React from "react";
import { Lock, Shuffle, Plus, Sun, Moon, ChevronDown } from "lucide-react";
import type { StyleGuide } from "@/types";
import { useRelumeBuilder } from "./RelumeBuilderProvider";

// ─── Color presets ─────────────────────────────────────────────────────────────

const GOOGLE_FONTS = [
  "Inter", "Roboto", "Open Sans", "Lato", "Poppins", "Montserrat",
  "Nunito", "Nunito Sans", "Raleway", "Playfair Display", "Merriweather",
  "Arimo", "Source Sans 3", "DM Sans", "Work Sans", "Outfit",
];

const COLOR_PALETTES = [
  { name: "Malibu", hex: "#74CEF2" },
  { name: "Cornflower Blue", hex: "#799DF3" },
  { name: "Manz", hex: "#EFEF6D" },
  { name: "Sunset", hex: "#FF7043" },
  { name: "Mint", hex: "#4CAF7D" },
  { name: "Lavender", hex: "#A78BFA" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, Math.round(l * 100)];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function isLight(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ title, shuffleLetter, onShuffle }: { title: string; shuffleLetter?: string; onShuffle?: () => void }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      {shuffleLetter && (
        <button
          onClick={onShuffle}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-gray-500 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
        >
          <Shuffle size={11} />
          Shuffle <span className="text-gray-400 font-mono ml-0.5">{shuffleLetter}</span>
        </button>
      )}
    </div>
  );
}

interface ColorCardProps {
  name: string;
  hex: string;
  isMain?: boolean;
  locked?: boolean;
  onChange: (hex: string) => void;
}

function ColorCard({ name, hex, isMain, locked, onChange }: ColorCardProps) {
  const [hsl] = React.useState(() => hexToHsl(hex));
  const light = isLight(hex);

  return (
    <div
      className="rounded-xl overflow-hidden border border-gray-200 cursor-pointer group relative flex-shrink-0"
      style={{ width: 160, minHeight: 140 }}
    >
      {/* Color swatch */}
      <div
        className="relative flex flex-col justify-between p-3 pt-4"
        style={{ backgroundColor: hex, minHeight: 100 }}
      >
        <div className="flex items-start justify-between">
          <span className={`text-xs font-semibold ${light ? "text-black/60" : "text-white/80"}`}>{name}</span>
          <button className={`p-1 rounded ${light ? "text-black/40 hover:text-black/70" : "text-white/40 hover:text-white/70"}`}>
            <Lock size={10} />
          </button>
        </div>
        <div className="flex items-end justify-between mt-6">
          <span className={`text-[11px] font-mono font-semibold ${light ? "text-black/60" : "text-white/70"}`}>
            {hex.slice(1).toUpperCase()}
          </span>
          {isMain && (
            <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${light ? "bg-black/15 text-black/60" : "bg-white/20 text-white/80"}`}>
              Main
            </span>
          )}
        </div>
        {/* Hue slider */}
        <input
          type="range"
          min={0}
          max={360}
          defaultValue={hsl[0]}
          className="absolute bottom-0 left-0 right-0 w-full h-2 opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity"
          style={{ accentColor: hex }}
        />
        <div className={`absolute bottom-0 left-0 right-0 h-1.5 rounded-b opacity-0 group-hover:opacity-100 transition-opacity`}
          style={{ background: `linear-gradient(to right, hsl(0,${hsl[1]}%,${hsl[2]}%), hsl(60,${hsl[1]}%,${hsl[2]}%), hsl(120,${hsl[1]}%,${hsl[2]}%), hsl(180,${hsl[1]}%,${hsl[2]}%), hsl(240,${hsl[1]}%,${hsl[2]}%), hsl(300,${hsl[1]}%,${hsl[2]}%), hsl(360,${hsl[1]}%,${hsl[2]}%))` }}
        />
      </div>

      {/* Input overlay */}
      <input
        type="color"
        value={hex}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        title="Changer la couleur"
      />
    </div>
  );
}

function NeutralsCard() {
  return (
    <div
      className="rounded-xl overflow-hidden border border-gray-200 flex-shrink-0"
      style={{ width: 160, minHeight: 140 }}
    >
      <div className="flex flex-col h-full">
        <div className="flex-1 grid grid-rows-6">
          {["#ffffff", "#f3f4f6", "#d1d5db", "#9ca3af", "#374151", "#111827"].map((c) => (
            <div key={c} style={{ backgroundColor: c, flex: 1 }} />
          ))}
        </div>
        <div className="px-3 py-2 bg-white">
          <span className="text-[11px] font-semibold text-gray-600">Neutrals</span>
        </div>
      </div>
    </div>
  );
}

function FontCard({ role, fontName, locked = true }: { role: string; fontName: string; locked?: boolean }) {
  return (
    <div className="flex-1 border border-gray-200 rounded-xl p-4 bg-white min-w-0">
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-medium text-gray-500">{role}</span>
        {locked && <Lock size={11} className="text-gray-300 mt-0.5" />}
      </div>
      <p className="text-2xl font-medium text-gray-900 mb-3" style={{ fontFamily: fontName, lineHeight: 1.2 }}>
        {fontName}
      </p>
      <div className="flex items-center gap-1.5">
        <div className="w-4 h-4 rounded bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
          <span className="text-white text-[7px] font-bold">G</span>
        </div>
        <span className="text-[10px] text-gray-400">Google</span>
        <span className="text-[10px] text-gray-300 ml-1">Free</span>
      </div>
    </div>
  );
}

function ButtonsCard({ style, borderRadius }: { style: string; borderRadius: string }) {
  return (
    <div className="flex-1 border border-gray-200 rounded-xl p-4 bg-white min-w-0">
      <div className="flex items-start justify-between mb-4">
        <span className="text-xs font-medium text-gray-500">Buttons &amp; Forms</span>
        <Lock size={11} className="text-gray-300 mt-0.5" />
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          className="px-3 py-1.5 text-xs font-medium text-white transition-colors"
          style={{ borderRadius, backgroundColor: "#1a56db" }}
        >
          Button
        </button>
        <button
          className="px-3 py-1.5 text-xs font-medium border border-gray-300 text-gray-700 bg-transparent transition-colors"
          style={{ borderRadius }}
        >
          Button
        </button>
      </div>
    </div>
  );
}

function CardsPreview({ borderRadius, shadow }: { borderRadius: string; shadow: string }) {
  const shadowClass = shadow === "none" ? "" : shadow === "sm" ? "shadow-sm" : shadow === "md" ? "shadow-md" : "shadow-lg";
  return (
    <div className="flex-1 border border-gray-200 rounded-xl p-4 bg-white min-w-0">
      <div className="flex items-start justify-between mb-4">
        <span className="text-xs font-medium text-gray-500">Cards &amp; Images</span>
        <Lock size={11} className="text-gray-300 mt-0.5" />
      </div>
      <div className="flex gap-2">
        {["bg-blue-100", "bg-green-100", "bg-purple-100"].map((color, i) => (
          <div
            key={i}
            className={`flex-1 aspect-square ${color} ${shadowClass}`}
            style={{ borderRadius: `calc(${borderRadius} * 0.7)` }}
          />
        ))}
      </div>
      <div className={`mt-2 bg-gray-50 ${shadowClass} p-2`} style={{ borderRadius }}>
        <div className="w-3/4 h-1.5 bg-gray-200 rounded mb-1" />
        <div className="w-1/2 h-1 bg-gray-150 rounded" />
      </div>
    </div>
  );
}

// ─── Live Preview ──────────────────────────────────────────────────────────────

function LivePreview({ guide }: { guide: StyleGuide }) {
  const btnStyle: React.CSSProperties = {
    borderRadius: guide.buttons.borderRadius,
    padding: "8px 16px",
    backgroundColor: guide.buttons.style === "filled" ? guide.colors.primary : "transparent",
    color: guide.buttons.style === "filled" ? "#ffffff" : guide.colors.primary,
    border: guide.buttons.style !== "filled" ? `1.5px solid ${guide.colors.primary}` : "none",
    fontFamily: guide.fonts.body,
    fontSize: 12,
    fontWeight: 500,
    cursor: "default",
  };

  const outlineStyle: React.CSSProperties = {
    ...btnStyle,
    backgroundColor: "transparent",
    color: guide.colors.text,
    border: `1.5px solid ${guide.colors.text}30`,
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#f5f5f5] p-4">
      <div
        className="rounded-xl overflow-hidden border border-gray-200 shadow-sm bg-white"
        style={{ fontFamily: guide.fonts.body }}
      >
        {/* Nav */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div
              className="w-5 h-5 rounded-full"
              style={{ backgroundColor: guide.colors.primary }}
            />
            <div className="flex items-center gap-4">
              {["À propos", "Services", "Contact"].map((l) => (
                <span key={l} className="text-xs text-gray-500">{l}</span>
              ))}
              <span className="text-xs text-gray-500 flex items-center gap-0.5">
                Solutions <ChevronDown size={8} />
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="text-xs text-gray-500 px-2 py-1 border border-gray-200 rounded text-[10px]">Button</button>
            <button
              className="text-xs text-white px-2 py-1 rounded text-[10px]"
              style={{ backgroundColor: guide.colors.primary, borderRadius: guide.buttons.borderRadius }}
            >
              Button
            </button>
          </div>
        </div>

        {/* Hero */}
        <div className="flex gap-4 px-5 py-6" style={{ backgroundColor: guide.colors.background }}>
          <div className="flex-1">
            <div className="text-[10px] text-gray-400 mb-2 uppercase tracking-wider font-medium"
              style={{ color: guide.colors.primary }}>
              Expertise
            </div>
            <h1
              className="mb-3 leading-tight"
              style={{
                fontFamily: guide.fonts.heading,
                fontSize: 22,
                fontWeight: 700,
                color: guide.colors.text,
              }}
            >
              {guide.fonts.heading} maîtrise le confort de votre maison
            </h1>
            <p className="text-xs mb-4 leading-relaxed" style={{ color: guide.colors.textMuted, fontSize: 11 }}>
              Depuis vingt ans, nous intervenons à La Rochelle, sur l&apos;île de Ré et dans un rayon de cent kilomètres. Climatisation, chauffage, pompe à chaleur, ventilation, photovoltaïque et plomberie.
            </p>
            <div className="flex gap-2">
              <button style={btnStyle}>Demander un devis</button>
              <button style={outlineStyle}>En savoir plus</button>
            </div>
          </div>
          <div
            className="flex-shrink-0 rounded-lg flex items-center justify-center"
            style={{
              width: 160,
              minHeight: 120,
              backgroundColor: guide.colors.backgroundAlt,
              borderRadius: guide.cards.borderRadius,
            }}
          >
            <div className="text-gray-300 text-2xl">🖼</div>
          </div>
        </div>

        {/* Services section */}
        <div className="px-5 py-5" style={{ backgroundColor: guide.colors.backgroundAlt }}>
          <div className="text-[9px] uppercase tracking-wider mb-1 font-medium" style={{ color: guide.colors.primary }}>
            Expertise
          </div>
          <h2
            className="mb-3"
            style={{ fontFamily: guide.fonts.heading, fontSize: 16, fontWeight: 700, color: guide.colors.text }}
          >
            Nos services couvrent tous vos besoins
          </h2>
          <div className="grid grid-cols-3 gap-2">
            {["Climatisation", "Chauffage", "Plomberie"].map((s) => (
              <div
                key={s}
                className="p-3 bg-white"
                style={{ borderRadius: guide.cards.borderRadius, boxShadow: guide.cards.shadow !== "none" ? "0 1px 3px rgba(0,0,0,0.08)" : "none" }}
              >
                <div className="w-5 h-5 rounded mb-2" style={{ backgroundColor: guide.colors.primary + "20" }} />
                <div className="text-[10px] font-semibold mb-1" style={{ color: guide.colors.text, fontFamily: guide.fonts.heading }}>{s}</div>
                <div className="text-[9px] leading-relaxed" style={{ color: guide.colors.textMuted }}>
                  Service professionnel et rapide dans tout le département.
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer hint */}
      <div className="flex items-center justify-center gap-1.5 mt-3 text-[10px] text-gray-400">
        <Shuffle size={9} />
        Scheme shuffle <span className="font-mono bg-gray-100 px-1 py-0.5 rounded ml-0.5">SPACE</span>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function StyleGuideWorkspace() {
  const { state, dispatch } = useRelumeBuilder();
  const { styleGuide: guide } = state;
  const [darkMode, setDarkMode] = React.useState(false);
  const [fontDropdownOpen, setFontDropdownOpen] = React.useState<"heading" | "body" | null>(null);
  const [concept] = React.useState("Concept 1");

  const updateColor = (key: keyof StyleGuide["colors"], hex: string) => {
    dispatch({ type: "UPDATE_STYLE_GUIDE", payload: { colors: { ...guide.colors, [key]: hex } } });
  };

  const updateFont = (role: "heading" | "body", font: string) => {
    dispatch({ type: "UPDATE_STYLE_GUIDE", payload: { fonts: { ...guide.fonts, [role]: font } } });
    setFontDropdownOpen(null);
  };

  const shuffleColors = () => {
    const palette = COLOR_PALETTES[Math.floor(Math.random() * COLOR_PALETTES.length)];
    dispatch({ type: "UPDATE_STYLE_GUIDE", payload: { colors: { ...guide.colors, primary: palette.hex } } });
  };

  const shuffleFonts = () => {
    const fonts = GOOGLE_FONTS;
    const h = fonts[Math.floor(Math.random() * fonts.length)];
    const b = fonts[Math.floor(Math.random() * fonts.length)];
    dispatch({ type: "UPDATE_STYLE_GUIDE", payload: { fonts: { ...guide.fonts, heading: h, body: b } } });
  };

  return (
    <div className="flex h-full bg-white overflow-hidden">

      {/* ─ Left: Style controls ─────────────────────────────────────────────── */}
      <div className="w-[55%] flex-shrink-0 flex flex-col border-r border-gray-200 overflow-hidden">

        {/* Top: Concept selector + mode toggle */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100">
          <button className="flex items-center gap-1.5 text-sm font-medium text-gray-800 hover:text-gray-900">
            {concept}
            <ChevronDown size={14} className="text-gray-400" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setDarkMode(false)}
                className={`p-2 transition-colors ${!darkMode ? "bg-gray-900 text-white" : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"}`}
              >
                <Sun size={13} />
              </button>
              <button
                onClick={() => setDarkMode(true)}
                className={`p-2 transition-colors ${darkMode ? "bg-gray-900 text-white" : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"}`}
              >
                <Moon size={13} />
              </button>
            </div>
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              <Shuffle size={11} />
              Shuffle <span className="font-mono text-gray-400 ml-0.5">C</span>
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors font-medium">
              Pitch Concepts
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-8">

          {/* ─ Colors ─────────────────────────────────────────────────────────── */}
          <section>
            <SectionHeader title="Colors" shuffleLetter="C" onShuffle={shuffleColors} />
            <div className="flex gap-3 flex-wrap">
              <NeutralsCard />
              <ColorCard
                name="Primary"
                hex={guide.colors.primary}
                isMain
                locked
                onChange={(h) => updateColor("primary", h)}
              />
              <ColorCard
                name="Secondary"
                hex={guide.colors.secondary}
                locked
                onChange={(h) => updateColor("secondary", h)}
              />
              <ColorCard
                name="Accent"
                hex={guide.colors.accent}
                locked
                onChange={(h) => updateColor("accent", h)}
              />
              {/* Add color */}
              <div
                className="rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center cursor-pointer hover:border-gray-300 transition-colors flex-shrink-0"
                style={{ width: 56, minHeight: 140 }}
              >
                <Plus size={16} className="text-gray-300" />
              </div>
            </div>
          </section>

          {/* ─ Typography ─────────────────────────────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900">Typography</h2>
              <div className="flex items-center gap-2">
                <div className="flex items-center border border-gray-200 rounded-md overflow-hidden">
                  <button className="px-2 py-1 text-[10px] text-gray-500 flex items-center gap-1 hover:bg-gray-50">
                    <span className="text-xs">A</span> Large - normal
                    <ChevronDown size={9} />
                  </button>
                </div>
                <button
                  onClick={shuffleFonts}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-gray-400 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
                >
                  <Shuffle size={11} />
                  <span className="font-mono">T</span>
                </button>
              </div>
            </div>

            <div className="flex gap-3">
              {/* Heading font */}
              <div className="flex-1 relative">
                <div
                  className="border border-gray-200 rounded-xl p-4 bg-white cursor-pointer hover:border-gray-300 transition-colors"
                  onClick={() => setFontDropdownOpen(fontDropdownOpen === "heading" ? null : "heading")}
                >
                  <div className="flex items-start justify-between mb-3">
                    <span className="text-xs font-medium text-gray-500">Heading</span>
                    <Lock size={11} className="text-gray-300 mt-0.5" />
                  </div>
                  <p className="text-2xl font-medium text-gray-900 mb-3 leading-tight" style={{ fontFamily: guide.fonts.heading }}>
                    {guide.fonts.heading}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <div className="w-4 h-4 rounded bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                      <span className="text-white text-[7px] font-bold">G</span>
                    </div>
                    <span className="text-[10px] text-gray-400">Google</span>
                    <span className="text-[10px] text-gray-300 ml-1">Free</span>
                  </div>
                </div>
                {fontDropdownOpen === "heading" && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-20 max-h-48 overflow-y-auto py-1">
                    {GOOGLE_FONTS.map((f) => (
                      <button
                        key={f}
                        onClick={() => updateFont("heading", f)}
                        className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                        style={{ fontFamily: f }}
                      >
                        {f}
                        {f === guide.fonts.heading && <span className="ml-auto text-blue-500 text-xs">✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Body font */}
              <div className="flex-1 relative">
                <div
                  className="border border-gray-200 rounded-xl p-4 bg-white cursor-pointer hover:border-gray-300 transition-colors"
                  onClick={() => setFontDropdownOpen(fontDropdownOpen === "body" ? null : "body")}
                >
                  <div className="flex items-start justify-between mb-3">
                    <span className="text-xs font-medium text-gray-500">Body</span>
                    <Lock size={11} className="text-gray-300 mt-0.5" />
                  </div>
                  <p className="text-2xl font-medium text-gray-900 mb-3 leading-tight" style={{ fontFamily: guide.fonts.body }}>
                    {guide.fonts.body}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <div className="w-4 h-4 rounded bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                      <span className="text-white text-[7px] font-bold">G</span>
                    </div>
                    <span className="text-[10px] text-gray-400">Google</span>
                    <span className="text-[10px] text-gray-300 ml-1">Free</span>
                  </div>
                </div>
                {fontDropdownOpen === "body" && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-20 max-h-48 overflow-y-auto py-1">
                    {GOOGLE_FONTS.map((f) => (
                      <button
                        key={f}
                        onClick={() => updateFont("body", f)}
                        className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                        style={{ fontFamily: f }}
                      >
                        {f}
                        {f === guide.fonts.body && <span className="ml-auto text-blue-500 text-xs">✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* ─ UI Styling ─────────────────────────────────────────────────────── */}
          <section>
            <SectionHeader title="UI Styling" shuffleLetter="U" />
            <div className="flex gap-3">
              <ButtonsCard style={guide.buttons.style} borderRadius={guide.buttons.borderRadius} />
              <CardsPreview borderRadius={guide.cards.borderRadius} shadow={guide.cards.shadow} />
            </div>

            {/* Radius + shadow controls */}
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-2 block">
                  Border radius — <span className="text-gray-400 font-mono">{guide.buttons.borderRadius}</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={32}
                  value={parseInt(guide.buttons.borderRadius)}
                  onChange={(e) =>
                    dispatch({ type: "UPDATE_STYLE_GUIDE", payload: { buttons: { ...guide.buttons, borderRadius: `${e.target.value}px` } } })
                  }
                  className="w-full accent-gray-900"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-2 block">Card shadow</label>
                <div className="flex gap-1.5">
                  {(["none", "sm", "md", "lg"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => dispatch({ type: "UPDATE_STYLE_GUIDE", payload: { cards: { ...guide.cards, shadow: s } } })}
                      className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${guide.cards.shadow === s ? "bg-gray-900 text-white border-gray-900" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* ─ Spacing ────────────────────────────────────────────────────────── */}
          <section className="pb-8">
            <SectionHeader title="Espacement" />
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-2 flex justify-between">
                  <span>Section padding</span>
                  <span className="text-gray-400 font-mono">{guide.spacing.sectionPadding}</span>
                </label>
                <input
                  type="range"
                  min={40}
                  max={160}
                  value={parseInt(guide.spacing.sectionPadding)}
                  onChange={(e) =>
                    dispatch({ type: "UPDATE_STYLE_GUIDE", payload: { spacing: { ...guide.spacing, sectionPadding: `${e.target.value}px` } } })
                  }
                  className="w-full accent-gray-900"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-2 flex justify-between">
                  <span>Largeur max</span>
                  <span className="text-gray-400 font-mono">{guide.spacing.maxContentWidth}</span>
                </label>
                <input
                  type="range"
                  min={800}
                  max={1600}
                  step={50}
                  value={parseInt(guide.spacing.maxContentWidth)}
                  onChange={(e) =>
                    dispatch({ type: "UPDATE_STYLE_GUIDE", payload: { spacing: { ...guide.spacing, maxContentWidth: `${e.target.value}px` } } })
                  }
                  className="w-full accent-gray-900"
                />
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* ─ Right: Live Preview ──────────────────────────────────────────────── */}
      <LivePreview guide={guide} />
    </div>
  );
}
