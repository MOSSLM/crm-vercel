"use client";

import React from "react";
import { Lock, Shuffle, Plus, Sun, Moon, ChevronDown, Eye, EyeOff, Type, Palette, Layout, Sliders } from "lucide-react";
import type { StyleGuide } from "@/types";
import { useRelumeBuilder } from "./RelumeBuilderProvider";

// ─── Constants ─────────────────────────────────────────────────────────────────

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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{children}</h3>;
}

interface ColorSwatchProps {
  label: string;
  hex: string;
  onChange: (hex: string) => void;
  small?: boolean;
}

function ColorSwatch({ label, hex, onChange, small }: ColorSwatchProps) {
  const light = isLight(hex);
  const [hsl] = React.useState(() => hexToHsl(hex));

  return (
    <div className={`relative group rounded-xl overflow-hidden border border-gray-200 flex-shrink-0 ${small ? "w-20" : "w-[140px]"}`} style={{ minHeight: small ? 80 : 120 }}>
      <div className="relative flex flex-col justify-between p-2.5 pt-3 h-full" style={{ backgroundColor: hex, minHeight: small ? 80 : 120 }}>
        <span className={`text-[10px] font-semibold ${light ? "text-black/60" : "text-white/80"}`}>{label}</span>
        <div className="flex items-end justify-between mt-auto">
          <span className={`text-[9px] font-mono ${light ? "text-black/50" : "text-white/60"}`}>{hex.slice(1).toUpperCase()}</span>
        </div>
        {/* Hue gradient bar */}
        <div
          className="absolute bottom-0 left-0 right-0 h-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: `linear-gradient(to right, hsl(0,${hsl[1]}%,${hsl[2]}%), hsl(60,${hsl[1]}%,${hsl[2]}%), hsl(120,${hsl[1]}%,${hsl[2]}%), hsl(180,${hsl[1]}%,${hsl[2]}%), hsl(240,${hsl[1]}%,${hsl[2]}%), hsl(300,${hsl[1]}%,${hsl[2]}%), hsl(360,${hsl[1]}%,${hsl[2]}%))` }}
        />
      </div>
      <input
        type="color"
        value={hex}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        title={`Modifier ${label}`}
      />
    </div>
  );
}

// ─── Live Preview ──────────────────────────────────────────────────────────────

function LivePreview({ guide, fullscreen, onToggleFullscreen }: { guide: StyleGuide; fullscreen: boolean; onToggleFullscreen: () => void }) {
  const btnFilled: React.CSSProperties = {
    borderRadius: guide.buttons.borderRadius,
    padding: guide.buttons.padding,
    backgroundColor: guide.colors.primary,
    color: isLight(guide.colors.primary) ? "#111" : "#fff",
    border: "none",
    fontFamily: guide.fonts.body + ", sans-serif",
    fontSize: 12,
    fontWeight: 600,
    cursor: "default",
    display: "inline-block",
  };

  const btnOutline: React.CSSProperties = {
    ...btnFilled,
    backgroundColor: "transparent",
    color: guide.colors.text,
    border: `1.5px solid ${guide.colors.text}40`,
  };

  const shadowMap: Record<string, string> = {
    none: "none",
    sm: "0 1px 2px rgba(0,0,0,0.06)",
    md: "0 4px 6px -1px rgba(0,0,0,0.10)",
    lg: "0 10px 15px -3px rgba(0,0,0,0.10)",
  };

  const preview = (
    <div style={{ fontFamily: guide.fonts.body + ", sans-serif", backgroundColor: guide.colors.background, color: guide.colors.text }}>
      {/* Navbar */}
      <div style={{ backgroundColor: guide.colors.background, borderBottom: `1px solid ${guide.colors.text}12` }}
        className="flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-4">
          <div className="w-6 h-6 rounded-full" style={{ backgroundColor: guide.colors.primary }} />
          <div className="flex items-center gap-5">
            {["À propos", "Services", "Contact"].map((l) => (
              <span key={l} className="text-xs" style={{ color: guide.colors.textMuted }}>{l}</span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button style={{ ...btnOutline, padding: "5px 12px", fontSize: 11 }}>Se connecter</button>
          <button style={{ ...btnFilled, padding: "5px 12px", fontSize: 11 }}>Essai gratuit</button>
        </div>
      </div>

      {/* Hero */}
      <div className="px-6 py-10 flex gap-8" style={{ backgroundColor: guide.colors.background }}>
        <div className="flex-1">
          <div className="text-[10px] font-semibold mb-2 uppercase tracking-widest" style={{ color: guide.colors.primary }}>
            Expertise
          </div>
          <h1 className="mb-3 leading-tight" style={{
            fontFamily: guide.fonts.heading + ", sans-serif",
            fontSize: 26, fontWeight: 800, color: guide.colors.text,
          }}>
            {guide.fonts.heading} pour votre succès
          </h1>
          <p className="mb-5 leading-relaxed text-xs" style={{ color: guide.colors.textMuted }}>
            Depuis vingt ans, nous intervenons avec expertise et passion pour répondre à tous vos besoins.
          </p>
          <div className="flex gap-2 flex-wrap">
            <button style={btnFilled}>Demander un devis</button>
            <button style={btnOutline}>En savoir plus</button>
          </div>
        </div>
        <div className="flex-shrink-0 rounded-xl flex items-center justify-center text-2xl"
          style={{
            width: 180, minHeight: 130,
            backgroundColor: guide.colors.backgroundAlt,
            borderRadius: guide.cards.borderRadius,
            boxShadow: shadowMap[guide.cards.shadow] ?? "none",
          }}>
          🖼
        </div>
      </div>

      {/* Features */}
      <div className="px-6 py-8" style={{ backgroundColor: guide.colors.backgroundAlt }}>
        <div className="text-[9px] uppercase tracking-wider mb-1 font-semibold" style={{ color: guide.colors.primary }}>Nos services</div>
        <h2 className="mb-4" style={{ fontFamily: guide.fonts.heading + ", sans-serif", fontSize: 18, fontWeight: 700, color: guide.colors.text }}>
          Tout ce dont vous avez besoin
        </h2>
        <div className="grid grid-cols-3 gap-3">
          {["Climatisation", "Chauffage", "Plomberie"].map((s) => (
            <div key={s} className="p-3" style={{
              backgroundColor: guide.colors.background,
              borderRadius: guide.cards.borderRadius,
              boxShadow: shadowMap[guide.cards.shadow] ?? "none",
            }}>
              <div className="w-6 h-6 rounded mb-2 flex items-center justify-center"
                style={{ backgroundColor: guide.colors.primary + "20", borderRadius: `calc(${guide.cards.borderRadius} * 0.6)` }}>
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: guide.colors.primary }} />
              </div>
              <div className="text-xs font-semibold mb-1" style={{ color: guide.colors.text, fontFamily: guide.fonts.heading + ", sans-serif" }}>{s}</div>
              <div className="text-[9px] leading-relaxed" style={{ color: guide.colors.textMuted }}>
                Service professionnel et rapide.
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="px-6 py-8 text-center" style={{ backgroundColor: guide.colors.primary }}>
        <h2 className="mb-2" style={{
          fontFamily: guide.fonts.heading + ", sans-serif",
          fontSize: 18, fontWeight: 700,
          color: isLight(guide.colors.primary) ? "#111" : "#fff",
        }}>
          Prêt à commencer ?
        </h2>
        <p className="text-xs mb-4" style={{ color: isLight(guide.colors.primary) ? "#11118888" : "#ffffff99" }}>
          Contactez-nous dès aujourd&apos;hui pour obtenir votre devis gratuit.
        </p>
        <button style={{
          ...btnFilled,
          backgroundColor: isLight(guide.colors.primary) ? "#111" : "#fff",
          color: isLight(guide.colors.primary) ? "#fff" : guide.colors.primary,
        }}>
          Obtenir un devis
        </button>
      </div>

      {/* Footer */}
      <div className="px-6 py-5 flex items-center justify-between"
        style={{ backgroundColor: guide.colors.background, borderTop: `1px solid ${guide.colors.text}12` }}>
        <div className="w-5 h-5 rounded-full" style={{ backgroundColor: guide.colors.primary }} />
        <div className="flex gap-4">
          {["Mentions légales", "Confidentialité", "Contact"].map((l) => (
            <span key={l} className="text-[10px]" style={{ color: guide.colors.textMuted }}>{l}</span>
          ))}
        </div>
      </div>
    </div>
  );

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-gray-900/80 flex items-center justify-center p-8">
        <div className="relative w-full max-w-4xl max-h-full overflow-auto rounded-2xl shadow-2xl border border-white/10">
          <button
            onClick={onToggleFullscreen}
            className="absolute top-3 right-3 z-10 p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-white"
            title="Quitter le plein écran"
          >
            <EyeOff size={16} />
          </button>
          {preview}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[#f5f5f5] relative">
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-2 bg-white/80 backdrop-blur border-b border-gray-100">
        <span className="text-xs font-medium text-gray-500">Aperçu en direct</span>
        <button
          onClick={onToggleFullscreen}
          className="p-1.5 hover:bg-gray-100 rounded-md transition-colors text-gray-400 hover:text-gray-700"
          title="Plein écran"
        >
          <Eye size={14} />
        </button>
      </div>
      <div className="p-4">
        <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm">
          {preview}
        </div>
      </div>
    </div>
  );
}

// ─── Tab type ──────────────────────────────────────────────────────────────────

type Tab = "colors" | "typography" | "ui" | "spacing";

// ─── Main Component ───────────────────────────────────────────────────────────

export function StyleGuideWorkspace() {
  const { state, dispatch } = useRelumeBuilder();
  const { styleGuide: guide } = state;
  const [darkMode, setDarkMode] = React.useState(false);
  const [fontDropdownOpen, setFontDropdownOpen] = React.useState<"heading" | "body" | null>(null);
  const [activeTab, setActiveTab] = React.useState<Tab>("colors");
  const [previewFullscreen, setPreviewFullscreen] = React.useState(false);

  const updateColor = (key: keyof StyleGuide["colors"], hex: string) =>
    dispatch({ type: "UPDATE_STYLE_GUIDE", payload: { colors: { ...guide.colors, [key]: hex } } });

  const updateFont = (role: "heading" | "body", font: string) => {
    dispatch({ type: "UPDATE_STYLE_GUIDE", payload: { fonts: { ...guide.fonts, [role]: font } } });
    setFontDropdownOpen(null);
  };

  const shuffleColors = () => {
    const palette = COLOR_PALETTES[Math.floor(Math.random() * COLOR_PALETTES.length)];
    dispatch({ type: "UPDATE_STYLE_GUIDE", payload: { colors: { ...guide.colors, primary: palette.hex } } });
  };

  const shuffleFonts = () => {
    const h = GOOGLE_FONTS[Math.floor(Math.random() * GOOGLE_FONTS.length)];
    const b = GOOGLE_FONTS[Math.floor(Math.random() * GOOGLE_FONTS.length)];
    dispatch({ type: "UPDATE_STYLE_GUIDE", payload: { fonts: { ...guide.fonts, heading: h, body: b } } });
  };

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "colors", label: "Couleurs", icon: Palette },
    { id: "typography", label: "Typographie", icon: Type },
    { id: "ui", label: "UI", icon: Layout },
    { id: "spacing", label: "Espacement", icon: Sliders },
  ];

  return (
    <div className="flex h-full bg-white overflow-hidden">

      {/* ─ Left: Style controls ─────────────────────────────────────────────── */}
      <div className="w-[52%] flex-shrink-0 flex flex-col border-r border-gray-200 overflow-hidden">

        {/* Top bar */}
        <div className="flex items-center justify-between px-5 py-2.5 border-b border-gray-100 bg-gray-50/60">
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setDarkMode(false)}
              className={`p-1.5 transition-colors ${!darkMode ? "bg-white shadow-sm text-gray-900" : "text-gray-400 hover:text-gray-600"}`}
              title="Mode clair"
            >
              <Sun size={13} />
            </button>
            <button
              onClick={() => setDarkMode(true)}
              className={`p-1.5 transition-colors ${darkMode ? "bg-white shadow-sm text-gray-900" : "text-gray-400 hover:text-gray-600"}`}
              title="Mode sombre"
            >
              <Moon size={13} />
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={shuffleColors}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-gray-500 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors bg-white"
            >
              <Shuffle size={11} />
              Couleurs
            </button>
            <button
              onClick={shuffleFonts}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-gray-500 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors bg-white"
            >
              <Shuffle size={11} />
              Polices
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors border-b-2 ${
                activeTab === id
                  ? "border-gray-900 text-gray-900 bg-white"
                  : "border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-50/50"
              }`}
            >
              <Icon size={11} />
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">

          {/* ── Colors tab ──────────────────────────────────────────────────── */}
          {activeTab === "colors" && (
            <>
              <div>
                <SectionLabel>Couleurs de marque</SectionLabel>
                <div className="flex gap-2 flex-wrap">
                  <ColorSwatch label="Primaire" hex={guide.colors.primary} onChange={(h) => updateColor("primary", h)} />
                  <ColorSwatch label="Secondaire" hex={guide.colors.secondary} onChange={(h) => updateColor("secondary", h)} />
                  <ColorSwatch label="Accent" hex={guide.colors.accent} onChange={(h) => updateColor("accent", h)} />
                  <div
                    className="rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center cursor-pointer hover:border-gray-300 transition-colors flex-shrink-0 w-10"
                    style={{ minHeight: 120 }}
                  >
                    <Plus size={14} className="text-gray-300" />
                  </div>
                </div>
              </div>

              <div>
                <SectionLabel>Arrière-plans</SectionLabel>
                <div className="flex gap-2 flex-wrap">
                  <ColorSwatch label="Background" hex={guide.colors.background} onChange={(h) => updateColor("background", h)} small />
                  <ColorSwatch label="Alt" hex={guide.colors.backgroundAlt} onChange={(h) => updateColor("backgroundAlt", h)} small />
                </div>
              </div>

              <div>
                <SectionLabel>Textes</SectionLabel>
                <div className="flex gap-2 flex-wrap">
                  <ColorSwatch label="Texte" hex={guide.colors.text} onChange={(h) => updateColor("text", h)} small />
                  <ColorSwatch label="Discret" hex={guide.colors.textMuted} onChange={(h) => updateColor("textMuted", h)} small />
                </div>
              </div>

              <div>
                <SectionLabel>Palettes suggérées</SectionLabel>
                <div className="flex gap-2 flex-wrap">
                  {COLOR_PALETTES.map((p) => (
                    <button
                      key={p.hex}
                      onClick={() => updateColor("primary", p.hex)}
                      className="w-8 h-8 rounded-full border-2 border-white shadow-sm hover:scale-110 transition-transform"
                      style={{ backgroundColor: p.hex }}
                      title={p.name}
                    />
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── Typography tab ──────────────────────────────────────────────── */}
          {activeTab === "typography" && (
            <>
              <div>
                <SectionLabel>Police de titre</SectionLabel>
                <div className="relative">
                  <div
                    className="border border-gray-200 rounded-xl p-4 bg-white cursor-pointer hover:border-gray-300 transition-colors"
                    onClick={() => setFontDropdownOpen(fontDropdownOpen === "heading" ? null : "heading")}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-gray-500 font-medium">Heading</span>
                      <ChevronDown size={12} className={`text-gray-400 transition-transform ${fontDropdownOpen === "heading" ? "rotate-180" : ""}`} />
                    </div>
                    <p className="text-3xl font-bold text-gray-900 leading-tight" style={{ fontFamily: guide.fonts.heading }}>
                      {guide.fonts.heading}
                    </p>
                    <div className="flex items-center gap-1.5 mt-2">
                      <div className="w-4 h-4 rounded bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                        <span className="text-white text-[7px] font-bold">G</span>
                      </div>
                      <span className="text-[10px] text-gray-400">Google Fonts · Gratuit</span>
                    </div>
                  </div>
                  {fontDropdownOpen === "heading" && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-20 max-h-52 overflow-y-auto py-1">
                      {GOOGLE_FONTS.map((f) => (
                        <button
                          key={f}
                          onClick={() => updateFont("heading", f)}
                          className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center justify-between"
                          style={{ fontFamily: f }}
                        >
                          {f}
                          {f === guide.fonts.heading && <span className="text-blue-500 text-xs">✓</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <SectionLabel>Police de corps</SectionLabel>
                <div className="relative">
                  <div
                    className="border border-gray-200 rounded-xl p-4 bg-white cursor-pointer hover:border-gray-300 transition-colors"
                    onClick={() => setFontDropdownOpen(fontDropdownOpen === "body" ? null : "body")}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-gray-500 font-medium">Body</span>
                      <ChevronDown size={12} className={`text-gray-400 transition-transform ${fontDropdownOpen === "body" ? "rotate-180" : ""}`} />
                    </div>
                    <p className="text-xl text-gray-900 leading-tight" style={{ fontFamily: guide.fonts.body }}>
                      {guide.fonts.body}
                    </p>
                    <p className="text-xs text-gray-400 mt-1" style={{ fontFamily: guide.fonts.body }}>
                      Aa Bb Cc — 0123456789
                    </p>
                    <div className="flex items-center gap-1.5 mt-2">
                      <div className="w-4 h-4 rounded bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                        <span className="text-white text-[7px] font-bold">G</span>
                      </div>
                      <span className="text-[10px] text-gray-400">Google Fonts · Gratuit</span>
                    </div>
                  </div>
                  {fontDropdownOpen === "body" && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-20 max-h-52 overflow-y-auto py-1">
                      {GOOGLE_FONTS.map((f) => (
                        <button
                          key={f}
                          onClick={() => updateFont("body", f)}
                          className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center justify-between"
                          style={{ fontFamily: f }}
                        >
                          {f}
                          {f === guide.fonts.body && <span className="text-blue-500 text-xs">✓</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <SectionLabel>Taille de base</SectionLabel>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={12}
                    max={20}
                    value={parseInt(guide.fonts.baseSize)}
                    onChange={(e) =>
                      dispatch({ type: "UPDATE_STYLE_GUIDE", payload: { fonts: { ...guide.fonts, baseSize: `${e.target.value}px` } } })
                    }
                    className="flex-1 accent-gray-900"
                  />
                  <span className="text-xs font-mono text-gray-500 w-8 text-right">{guide.fonts.baseSize}</span>
                </div>
                <div className="mt-3 p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <p className="font-semibold" style={{ fontSize: parseInt(guide.fonts.baseSize) * 1.5, fontFamily: guide.fonts.heading, color: guide.colors.text }}>
                    Titre principal
                  </p>
                  <p style={{ fontSize: parseInt(guide.fonts.baseSize), fontFamily: guide.fonts.body, color: guide.colors.textMuted, marginTop: 4 }}>
                    Texte de paragraphe en taille normale.
                  </p>
                  <p style={{ fontSize: parseInt(guide.fonts.baseSize) * 0.85, fontFamily: guide.fonts.body, color: guide.colors.textMuted, marginTop: 2 }}>
                    Texte secondaire plus discret.
                  </p>
                </div>
              </div>
            </>
          )}

          {/* ── UI tab ──────────────────────────────────────────────────────── */}
          {activeTab === "ui" && (
            <>
              <div>
                <SectionLabel>Style des boutons</SectionLabel>
                <div className="flex gap-2 mb-4">
                  {(["filled", "outline", "soft"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => dispatch({ type: "UPDATE_STYLE_GUIDE", payload: { buttons: { ...guide.buttons, style: s } } })}
                      className={`flex-1 py-2 text-xs rounded-lg border transition-colors capitalize ${guide.buttons.style === s ? "bg-gray-900 text-white border-gray-900" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>

                <div className="p-4 rounded-xl border border-gray-100 bg-gray-50 flex flex-wrap gap-2 items-center">
                  {/* Primary button preview */}
                  <button style={{
                    borderRadius: guide.buttons.borderRadius,
                    padding: guide.buttons.padding,
                    backgroundColor: guide.buttons.style === "soft"
                      ? guide.colors.primary + "20"
                      : guide.buttons.style === "filled"
                        ? guide.colors.primary
                        : "transparent",
                    color: guide.buttons.style === "filled"
                      ? (isLight(guide.colors.primary) ? "#111" : "#fff")
                      : guide.colors.primary,
                    border: guide.buttons.style === "outline" ? `1.5px solid ${guide.colors.primary}` : "none",
                    fontFamily: guide.fonts.body + ", sans-serif",
                    fontSize: 12, fontWeight: 600, cursor: "default",
                  }}>
                    Bouton principal
                  </button>
                  {/* Secondary */}
                  <button style={{
                    borderRadius: guide.buttons.borderRadius,
                    padding: guide.buttons.padding,
                    backgroundColor: "transparent",
                    color: guide.colors.text,
                    border: `1.5px solid ${guide.colors.text}30`,
                    fontFamily: guide.fonts.body + ", sans-serif",
                    fontSize: 12, fontWeight: 500, cursor: "default",
                  }}>
                    Secondaire
                  </button>
                </div>
              </div>

              <div>
                <SectionLabel>Arrondi des boutons</SectionLabel>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={32}
                    value={parseInt(guide.buttons.borderRadius)}
                    onChange={(e) =>
                      dispatch({ type: "UPDATE_STYLE_GUIDE", payload: { buttons: { ...guide.buttons, borderRadius: `${e.target.value}px` } } })
                    }
                    className="flex-1 accent-gray-900"
                  />
                  <span className="text-xs font-mono text-gray-500 w-8 text-right">{guide.buttons.borderRadius}</span>
                </div>
                <div className="flex gap-1.5 mt-2">
                  {[{ label: "Carré", val: "0px" }, { label: "Petit", val: "4px" }, { label: "Moyen", val: "8px" }, { label: "Large", val: "16px" }, { label: "Pilule", val: "999px" }].map(({ label, val }) => (
                    <button
                      key={val}
                      onClick={() => dispatch({ type: "UPDATE_STYLE_GUIDE", payload: { buttons: { ...guide.buttons, borderRadius: val } } })}
                      className={`flex-1 py-1 text-[10px] rounded border transition-colors ${guide.buttons.borderRadius === val ? "bg-gray-900 text-white border-gray-900" : "border-gray-200 text-gray-400 hover:bg-gray-50"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <SectionLabel>Cartes &amp; images</SectionLabel>
                <div>
                  <label className="text-xs text-gray-500 mb-2 flex justify-between">
                    <span>Arrondi</span>
                    <span className="font-mono">{guide.cards.borderRadius}</span>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={32}
                    value={parseInt(guide.cards.borderRadius)}
                    onChange={(e) =>
                      dispatch({ type: "UPDATE_STYLE_GUIDE", payload: { cards: { ...guide.cards, borderRadius: `${e.target.value}px` } } })
                    }
                    className="w-full accent-gray-900 mb-3"
                  />
                  <label className="text-xs text-gray-500 mb-2 block">Ombre</label>
                  <div className="flex gap-1.5">
                    {(["none", "sm", "md", "lg"] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => dispatch({ type: "UPDATE_STYLE_GUIDE", payload: { cards: { ...guide.cards, shadow: s } } })}
                        className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors ${guide.cards.shadow === s ? "bg-gray-900 text-white border-gray-900" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Card preview */}
                <div className="mt-3 flex gap-2">
                  {["bg-blue-100", "bg-green-100", "bg-purple-100"].map((c, i) => (
                    <div
                      key={i}
                      className={`flex-1 aspect-square ${c}`}
                      style={{
                        borderRadius: guide.cards.borderRadius,
                        boxShadow: { none: "none", sm: "0 1px 2px rgba(0,0,0,0.06)", md: "0 4px 6px rgba(0,0,0,0.1)", lg: "0 10px 15px rgba(0,0,0,0.1)" }[guide.cards.shadow] ?? "none",
                      }}
                    />
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── Spacing tab ─────────────────────────────────────────────────── */}
          {activeTab === "spacing" && (
            <>
              <div>
                <SectionLabel>Padding des sections</SectionLabel>
                <div className="flex items-center gap-3">
                  <input
                    type="range" min={40} max={160}
                    value={parseInt(guide.spacing.sectionPadding)}
                    onChange={(e) =>
                      dispatch({ type: "UPDATE_STYLE_GUIDE", payload: { spacing: { ...guide.spacing, sectionPadding: `${e.target.value}px` } } })
                    }
                    className="flex-1 accent-gray-900"
                  />
                  <span className="text-xs font-mono text-gray-500 w-12 text-right">{guide.spacing.sectionPadding}</span>
                </div>
              </div>
              <div>
                <SectionLabel>Gap entre éléments</SectionLabel>
                <div className="flex items-center gap-3">
                  <input
                    type="range" min={8} max={64}
                    value={parseInt(guide.spacing.elementGap)}
                    onChange={(e) =>
                      dispatch({ type: "UPDATE_STYLE_GUIDE", payload: { spacing: { ...guide.spacing, elementGap: `${e.target.value}px` } } })
                    }
                    className="flex-1 accent-gray-900"
                  />
                  <span className="text-xs font-mono text-gray-500 w-12 text-right">{guide.spacing.elementGap}</span>
                </div>
              </div>
              <div>
                <SectionLabel>Largeur max du contenu</SectionLabel>
                <div className="flex items-center gap-3">
                  <input
                    type="range" min={800} max={1600} step={50}
                    value={parseInt(guide.spacing.maxContentWidth)}
                    onChange={(e) =>
                      dispatch({ type: "UPDATE_STYLE_GUIDE", payload: { spacing: { ...guide.spacing, maxContentWidth: `${e.target.value}px` } } })
                    }
                    className="flex-1 accent-gray-900"
                  />
                  <span className="text-xs font-mono text-gray-500 w-16 text-right">{guide.spacing.maxContentWidth}</span>
                </div>
              </div>

              {/* Visual spacing guide */}
              <div>
                <SectionLabel>Visualisation</SectionLabel>
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="bg-gray-50 flex items-center justify-center"
                    style={{ paddingTop: Math.round(parseInt(guide.spacing.sectionPadding) * 0.15), paddingBottom: Math.round(parseInt(guide.spacing.sectionPadding) * 0.15) }}>
                    <div className="flex flex-col items-center" style={{ gap: parseInt(guide.spacing.elementGap) * 0.3 }}>
                      <div className="h-2 rounded bg-gray-300" style={{ width: Math.min(parseInt(guide.spacing.maxContentWidth) * 0.13, 120) }} />
                      <div className="h-1.5 rounded bg-gray-200" style={{ width: Math.min(parseInt(guide.spacing.maxContentWidth) * 0.1, 90) }} />
                      <div className="h-1 rounded bg-gray-200" style={{ width: Math.min(parseInt(guide.spacing.maxContentWidth) * 0.08, 70) }} />
                    </div>
                  </div>
                  <div className="px-3 py-2 bg-white flex justify-between text-[10px] text-gray-400 border-t border-gray-100">
                    <span>Section: {guide.spacing.sectionPadding}</span>
                    <span>Gap: {guide.spacing.elementGap}</span>
                    <span>Max: {guide.spacing.maxContentWidth}</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Reset button */}
        <div className="p-4 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
          <span className="text-[10px] text-gray-400">Les changements sont appliqués en temps réel</span>
          <button
            onClick={() => {
              dispatch({
                type: "UPDATE_STYLE_GUIDE",
                payload: {
                  colors: { primary: "#1a56db", secondary: "#6875f5", accent: "#e3a008", background: "#ffffff", backgroundAlt: "#f9fafb", text: "#111827", textMuted: "#6b7280" },
                },
              });
            }}
            className="text-[10px] text-gray-400 hover:text-gray-600 underline transition-colors"
          >
            Réinitialiser
          </button>
        </div>
      </div>

      {/* ─ Right: Live Preview ──────────────────────────────────────────────── */}
      <LivePreview guide={guide} fullscreen={previewFullscreen} onToggleFullscreen={() => setPreviewFullscreen(!previewFullscreen)} />
    </div>
  );
}
