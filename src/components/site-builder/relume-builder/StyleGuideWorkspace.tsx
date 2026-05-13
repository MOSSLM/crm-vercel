"use client";

import React from "react";
import {
  X, Copy, Check, Shuffle, ChevronDown, Eye, EyeOff, Layers,
} from "lucide-react";
import type { StyleGuide, SiteSectionDef } from "@/types";
import { useRelumeBuilder } from "./RelumeBuilderProvider";
import { generateColorShades, isLightColor } from "@/lib/color-utils";
import { DynamicSectionRenderer } from "../DynamicSectionRenderer";

// ── Constants ─────────────────────────────────────────────────────────────────

const GOOGLE_FONTS = [
  "Inter", "Roboto", "Open Sans", "Lato", "Poppins", "Montserrat",
  "Nunito", "Nunito Sans", "Raleway", "Playfair Display", "Merriweather",
  "Arimo", "Source Sans 3", "DM Sans", "Work Sans", "Outfit",
  "Plus Jakarta Sans", "Sora", "Unbounded", "Space Grotesk",
];

const COLOR_PALETTES = [
  { name: "Malibu", hex: "#74CEF2" },
  { name: "Cornflower Blue", hex: "#799DF3" },
  { name: "Manz", hex: "#EFEF6D" },
  { name: "Sunset", hex: "#FF7043" },
  { name: "Mint", hex: "#4CAF7D" },
  { name: "Lavender", hex: "#A78BFA" },
  { name: "Rose", hex: "#F43F5E" },
  { name: "Teal", hex: "#14B8A6" },
];

const SHADE_STOPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function isLight(hex: string): boolean {
  if (!hex || hex.length < 7) return true;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}

function isValidHex(hex: string): boolean {
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(hex);
}

// ── Google Fonts Loader ───────────────────────────────────────────────────────

export function useGoogleFonts(families: string[]) {
  const key = families.filter(Boolean).join(",");
  React.useEffect(() => {
    const toLoad = [...new Set(families)].filter(Boolean);
    toLoad.forEach((family) => {
      const id = `gfont-${family.replace(/\s+/g, "-").toLowerCase()}`;
      if (document.getElementById(id)) return;
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@400;500;600;700&display=swap`;
      document.head.appendChild(link);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

// ── Modal Wrapper ─────────────────────────────────────────────────────────────

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  // Close on Escape
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <span className="font-semibold text-gray-900 text-sm">{title}</span>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-700 rounded-md hover:bg-gray-100 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">{children}</div>
      </div>
    </div>
  );
}

// ── Hex Color Input ───────────────────────────────────────────────────────────

function HexColorInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const [draft, setDraft] = React.useState(value);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => { setDraft(value); }, [value]);

  const commit = (v: string) => {
    const clean = v.startsWith("#") ? v : `#${v}`;
    if (isValidHex(clean)) { onChange(clean); setDraft(clean); }
    else setDraft(value);
  };

  const copy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-gray-500">{label}</label>
      <div className="flex items-center gap-2">
        {/* Color swatch + native picker overlay */}
        <div className="relative flex-shrink-0">
          <div
            className="w-10 h-10 rounded-lg border-2 border-white shadow-md"
            style={{ backgroundColor: isValidHex(draft) ? draft : value }}
          />
          <input
            type="color"
            value={isValidHex(draft) ? draft : value}
            onChange={(e) => { setDraft(e.target.value); onChange(e.target.value); }}
            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
          />
        </div>
        {/* Hex text input */}
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") commit((e.target as HTMLInputElement).value); }}
          placeholder="#000000"
          spellCheck={false}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
        />
        {/* Copy button */}
        <button
          onClick={copy}
          className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0"
          title="Copier #hex"
        >
          {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
        </button>
      </div>
    </div>
  );
}

// ── Shade Strip ───────────────────────────────────────────────────────────────

function ShadeStrip({ label, baseHex }: { label: string; baseHex: string }) {
  const [copiedHex, setCopiedHex] = React.useState<string | null>(null);
  const shades = React.useMemo(() => generateColorShades(baseHex), [baseHex]);

  const copyHex = (hex: string) => {
    navigator.clipboard.writeText(hex).then(() => {
      setCopiedHex(hex);
      setTimeout(() => setCopiedHex(null), 1200);
    });
  };

  return (
    <div className="space-y-1.5">
      <span className="text-[11px] text-gray-400 font-medium">{label}</span>
      <div className="flex gap-0.5 h-5 rounded-md overflow-hidden">
        {SHADE_STOPS.map((stop) => (
          <div
            key={stop}
            className="flex-1 cursor-pointer transition-opacity hover:opacity-80 flex items-center justify-center"
            style={{ backgroundColor: shades[stop] }}
            title={`${stop}: ${shades[stop]}`}
            onClick={() => copyHex(shades[stop])}
          >
            {copiedHex === shades[stop] && (
              <Check size={6} style={{ color: isLightColor(shades[stop]) ? "#000" : "#fff" }} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Zone Card ─────────────────────────────────────────────────────────────────

function ZoneCard({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left border border-gray-200 rounded-xl p-3.5 hover:border-gray-300 hover:bg-gray-50/50 transition-all group"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
          {title}
        </span>
        <ChevronDown
          size={11}
          className="text-gray-300 group-hover:text-gray-500 transition-colors -rotate-90"
        />
      </div>
      {children}
    </button>
  );
}

// ── Modal: Colors ─────────────────────────────────────────────────────────────

function ColorsModal({
  guide,
  onUpdate,
  onClose,
}: {
  guide: StyleGuide;
  onUpdate: (key: keyof StyleGuide["colors"], v: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal title="Couleurs" onClose={onClose}>
      {/* Palette shuffle */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-600">Couleurs de marque</span>
        <button
          onClick={() => {
            const p = COLOR_PALETTES[Math.floor(Math.random() * COLOR_PALETTES.length)];
            onUpdate("primary", p.hex);
          }}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-gray-500 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
        >
          <Shuffle size={10} />
          Aléatoire
        </button>
      </div>

      {/* Brand colors */}
      <div className="grid grid-cols-3 gap-3">
        {(["primary", "secondary", "accent"] as const).map((key) => (
          <HexColorInput
            key={key}
            label={{ primary: "Primaire", secondary: "Secondaire", accent: "Accent" }[key]}
            value={guide.colors[key]}
            onChange={(v) => onUpdate(key, v)}
          />
        ))}
      </div>

      {/* BG + text colors */}
      <div className="grid grid-cols-2 gap-3">
        {(
          [
            ["background", "Background"],
            ["backgroundAlt", "Fond alt."],
            ["text", "Texte"],
            ["textMuted", "Texte atténué"],
          ] as const
        ).map(([key, label]) => (
          <HexColorInput
            key={key}
            label={label}
            value={guide.colors[key]}
            onChange={(v) => onUpdate(key, v)}
          />
        ))}
      </div>

      {/* Shade strips */}
      <div className="pt-1 border-t border-gray-100">
        <p className="text-[11px] text-gray-400 mb-2.5">Nuances (cliquer pour copier)</p>
        <div className="space-y-2">
          <ShadeStrip label="Primaire" baseHex={guide.colors.primary} />
          <ShadeStrip label="Secondaire" baseHex={guide.colors.secondary} />
          <ShadeStrip label="Accent" baseHex={guide.colors.accent} />
        </div>
      </div>

      {/* Palette chips */}
      <div>
        <p className="text-[11px] text-gray-400 mb-2">Palettes suggérées</p>
        <div className="flex gap-2 flex-wrap">
          {COLOR_PALETTES.map((p) => (
            <button
              key={p.hex}
              onClick={() => onUpdate("primary", p.hex)}
              className="w-8 h-8 rounded-full border-2 border-white shadow hover:scale-110 transition-transform"
              style={{ backgroundColor: p.hex }}
              title={p.name}
            />
          ))}
        </div>
      </div>
    </Modal>
  );
}

// ── Modal: Font ───────────────────────────────────────────────────────────────

function FontModal({
  role,
  guide,
  onUpdate,
  onClose,
}: {
  role: "heading" | "body";
  guide: StyleGuide;
  onUpdate: (v: string) => void;
  onClose: () => void;
}) {
  const current = role === "heading" ? guide.fonts.heading : guide.fonts.body;
  const [search, setSearch] = React.useState("");
  const filtered = GOOGLE_FONTS.filter((f) =>
    f.toLowerCase().includes(search.toLowerCase())
  );

  // Load all list fonts so previews render
  useGoogleFonts(GOOGLE_FONTS);

  return (
    <Modal
      title={role === "heading" ? "Police de titres" : "Police de corps"}
      onClose={onClose}
    >
      {/* Search + shuffle */}
      <div className="flex gap-2">
        <input
          autoFocus
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher..."
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
        />
        <button
          onClick={() => {
            const f = GOOGLE_FONTS[Math.floor(Math.random() * GOOGLE_FONTS.length)];
            onUpdate(f);
          }}
          className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-400 hover:text-gray-700 transition-colors"
          title="Police aléatoire"
        >
          <Shuffle size={14} />
        </button>
      </div>

      {/* Current font preview */}
      <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
        {role === "heading" ? (
          <p className="text-2xl font-bold text-gray-900 leading-tight" style={{ fontFamily: current }}>
            {current}
          </p>
        ) : (
          <>
            <p className="text-base text-gray-800" style={{ fontFamily: current }}>{current}</p>
            <p className="text-xs text-gray-400 mt-1" style={{ fontFamily: current }}>Aa Bb Cc — 0123456789</p>
          </>
        )}
      </div>

      {/* Base size (body only) */}
      {role === "body" && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-gray-500">Taille de base</label>
            <span className="text-xs font-mono text-gray-400">{guide.fonts.baseSize}</span>
          </div>
          <input
            type="range" min={12} max={20}
            value={parseInt(guide.fonts.baseSize)}
            onChange={(e) => {
              /* dispatch handled by parent via onUpdate — only font family here */
            }}
            className="w-full accent-gray-900"
            disabled
          />
          <p className="text-[10px] text-gray-300 mt-1">Modifiable dans l&apos;onglet Espacement</p>
        </div>
      )}

      {/* Font list */}
      <div className="space-y-0.5 max-h-52 overflow-y-auto -mx-1 pr-1">
        {filtered.map((f) => (
          <button
            key={f}
            onClick={() => onUpdate(f)}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm text-left transition-colors ${
              f === current
                ? "bg-gray-900 text-white"
                : "text-gray-700 hover:bg-gray-50"
            }`}
            style={{ fontFamily: f }}
          >
            {f}
            {f === current && <Check size={12} />}
          </button>
        ))}
      </div>
    </Modal>
  );
}

// ── Modal: Buttons ────────────────────────────────────────────────────────────

function ButtonsModal({
  guide,
  onUpdate,
  onClose,
}: {
  guide: StyleGuide;
  onUpdate: (updates: Partial<StyleGuide["buttons"]>) => void;
  onClose: () => void;
}) {
  const b = guide.buttons;
  const previewStyle = (style: "filled" | "outline" | "soft"): React.CSSProperties => ({
    borderRadius: b.borderRadius,
    padding: b.padding,
    backgroundColor:
      style === "soft"
        ? guide.colors.primary + "22"
        : style === "filled"
        ? guide.colors.primary
        : "transparent",
    color:
      style === "filled"
        ? isLight(guide.colors.primary) ? "#111" : "#fff"
        : guide.colors.primary,
    border: style === "outline" ? `1.5px solid ${guide.colors.primary}` : "none",
    fontFamily: guide.fonts.body + ", sans-serif",
    fontSize: 13,
    fontWeight: 600,
    display: "inline-block",
    cursor: "default",
  });

  return (
    <Modal title="Style des boutons" onClose={onClose}>
      {/* Style selector */}
      <div>
        <label className="text-xs font-medium text-gray-500 block mb-2">Style</label>
        <div className="flex gap-2">
          {(["filled", "outline", "soft"] as const).map((s) => (
            <button
              key={s}
              onClick={() => onUpdate({ style: s })}
              className={`flex-1 py-2 text-xs rounded-lg border transition-colors ${
                b.style === s
                  ? "bg-gray-900 text-white border-gray-900"
                  : "border-gray-200 text-gray-500 hover:bg-gray-50"
              }`}
            >
              {s === "filled" ? "Plein" : s === "outline" ? "Contour" : "Doux"}
            </button>
          ))}
        </div>
      </div>

      {/* Border radius */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-gray-500">Arrondi</label>
          <span className="text-xs font-mono text-gray-400">{b.borderRadius}</span>
        </div>
        <input
          type="range" min={0} max={32}
          value={parseInt(b.borderRadius)}
          onChange={(e) => onUpdate({ borderRadius: `${e.target.value}px` })}
          className="w-full accent-gray-900 mb-2"
        />
        <div className="flex gap-1.5">
          {[
            { label: "Carré", val: "0px" },
            { label: "Petit", val: "4px" },
            { label: "Moyen", val: "8px" },
            { label: "Large", val: "16px" },
            { label: "Pilule", val: "999px" },
          ].map(({ label, val }) => (
            <button
              key={val}
              onClick={() => onUpdate({ borderRadius: val })}
              className={`flex-1 py-1 text-[10px] rounded border transition-colors ${
                b.borderRadius === val
                  ? "bg-gray-900 text-white border-gray-900"
                  : "border-gray-200 text-gray-400 hover:bg-gray-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Live preview */}
      <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
        <p className="text-[11px] text-gray-400 mb-3">Aperçu</p>
        <div className="flex flex-wrap gap-3 items-center">
          <div style={previewStyle(b.style)}>Bouton principal</div>
          <div style={previewStyle("outline")}>Secondaire</div>
        </div>
      </div>
    </Modal>
  );
}

// ── Modal: Cards ──────────────────────────────────────────────────────────────

function CardsModal({
  guide,
  onUpdate,
  onClose,
}: {
  guide: StyleGuide;
  onUpdate: (updates: Partial<StyleGuide["cards"]>) => void;
  onClose: () => void;
}) {
  const c = guide.cards;
  const shadowMap: Record<string, string> = {
    none: "none",
    sm: "0 1px 2px rgba(0,0,0,0.06)",
    md: "0 4px 6px rgba(0,0,0,0.1)",
    lg: "0 10px 15px rgba(0,0,0,0.1)",
  };

  return (
    <Modal title="Cartes &amp; images" onClose={onClose}>
      {/* Radius — independent of button radius */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-gray-500">Arrondi des cartes</label>
          <span className="text-xs font-mono text-gray-400">{c.borderRadius}</span>
        </div>
        <input
          type="range" min={0} max={32}
          value={parseInt(c.borderRadius)}
          onChange={(e) => onUpdate({ borderRadius: `${e.target.value}px` })}
          className="w-full accent-gray-900"
        />
        <p className="text-[10px] text-gray-300 mt-1">
          Indépendant de l&apos;arrondi des boutons
        </p>
      </div>

      {/* Shadow */}
      <div>
        <label className="text-xs font-medium text-gray-500 block mb-2">Ombre</label>
        <div className="flex gap-1.5">
          {(["none", "sm", "md", "lg"] as const).map((s) => (
            <button
              key={s}
              onClick={() => onUpdate({ shadow: s })}
              className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors ${
                c.shadow === s
                  ? "bg-gray-900 text-white border-gray-900"
                  : "border-gray-200 text-gray-500 hover:bg-gray-50"
              }`}
            >
              {s === "none" ? "Aucune" : s.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Preview */}
      <div>
        <p className="text-[11px] text-gray-400 mb-2">Aperçu</p>
        <div className="flex gap-2">
          {["#EBF5FB", "#E9F7EF", "#F5EEF8"].map((bg, i) => (
            <div
              key={i}
              className="flex-1 h-16"
              style={{
                backgroundColor: bg,
                borderRadius: c.borderRadius,
                boxShadow: shadowMap[c.shadow] ?? "none",
              }}
            />
          ))}
        </div>
      </div>
    </Modal>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

type ModalId = "colors" | "heading" | "body" | "buttons" | "cards" | null;

interface StyleGuideWorkspaceProps {
  sectionDefs: Record<string, SiteSectionDef>;
}

export function StyleGuideWorkspace({ sectionDefs }: StyleGuideWorkspaceProps) {
  const { state, dispatch } = useRelumeBuilder();
  const { styleGuide: guide } = state;
  const [activeModal, setActiveModal] = React.useState<ModalId>(null);
  const [previewFullscreen, setPreviewFullscreen] = React.useState(false);

  // Load currently selected fonts in the browser so previews render correctly
  useGoogleFonts([guide.fonts.heading, guide.fonts.body]);

  const updateColor = (key: keyof StyleGuide["colors"], hex: string) =>
    dispatch({ type: "UPDATE_STYLE_GUIDE", payload: { colors: { ...guide.colors, [key]: hex } } });

  const updateFont = (role: "heading" | "body", value: string) =>
    dispatch({ type: "UPDATE_STYLE_GUIDE", payload: { fonts: { ...guide.fonts, [role]: value } } });

  const updateButtons = (updates: Partial<StyleGuide["buttons"]>) =>
    dispatch({ type: "UPDATE_STYLE_GUIDE", payload: { buttons: { ...guide.buttons, ...updates } } });

  const updateCards = (updates: Partial<StyleGuide["cards"]>) =>
    dispatch({ type: "UPDATE_STYLE_GUIDE", payload: { cards: { ...guide.cards, ...updates } } });

  const close = () => setActiveModal(null);

  // Live preview content
  const homeSlug =
    state.sitemap.find((p) => p.slug === "/")?.slug ??
    state.sitemap[0]?.slug ??
    "/";
  const homeInstanceIds = state.instancesByPage[homeSlug] ?? [];

  const livePreview = (
    <div style={{ backgroundColor: guide.colors.background }}>
      {homeInstanceIds.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center px-8">
          <Layers size={28} className="text-gray-200 mb-3" />
          <p className="text-sm text-gray-400 mb-1">Aucune section sur la page d&apos;accueil</p>
          <p className="text-xs text-gray-300">
            Ajoutez des sections dans le Wireframe pour prévisualiser ici.
          </p>
        </div>
      ) : (
        homeInstanceIds.map((id) => {
          const instance = state.instances[id];
          if (!instance || instance.is_hidden) return null;
          const secDef =
            instance.section_def ??
            (instance.section_id ? sectionDefs[instance.section_id] : null);
          if (!secDef) return null;
          return (
            <DynamicSectionRenderer
              key={id}
              instance={{ ...instance, section_def: secDef }}
              sectionDef={secDef}
              styleGuide={guide}
              variables={state.variableContext}
            />
          );
        })
      )}
    </div>
  );

  return (
    <div className="flex h-full bg-white overflow-hidden">

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      {activeModal === "colors" && (
        <ColorsModal guide={guide} onUpdate={updateColor} onClose={close} />
      )}
      {activeModal === "heading" && (
        <FontModal
          role="heading"
          guide={guide}
          onUpdate={(v) => updateFont("heading", v)}
          onClose={close}
        />
      )}
      {activeModal === "body" && (
        <FontModal
          role="body"
          guide={guide}
          onUpdate={(v) => updateFont("body", v)}
          onClose={close}
        />
      )}
      {activeModal === "buttons" && (
        <ButtonsModal guide={guide} onUpdate={updateButtons} onClose={close} />
      )}
      {activeModal === "cards" && (
        <CardsModal guide={guide} onUpdate={updateCards} onClose={close} />
      )}

      {/* ── Left: Zone layout ───────────────────────────────────────────────── */}
      <div className="w-[42%] flex-shrink-0 flex flex-col border-r border-gray-200 overflow-hidden">

        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50/60 flex-shrink-0">
          <span className="text-xs font-semibold text-gray-700">Style Guide</span>
          <span className="text-[10px] text-gray-400">Cliquez une zone pour modifier</span>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">

          {/* COLORS — full width zone */}
          <ZoneCard title="Couleurs" onClick={() => setActiveModal("colors")}>
            <div className="flex gap-2 flex-wrap">
              {(
                [
                  { key: "primary", label: "Primaire" },
                  { key: "secondary", label: "Secondaire" },
                  { key: "accent", label: "Accent" },
                  { key: "background", label: "BG" },
                  { key: "text", label: "Texte" },
                ] as const
              ).map(({ key, label }) => (
                <div key={key} className="flex flex-col items-center gap-1">
                  <div
                    className="w-8 h-8 rounded-lg border border-gray-200 shadow-sm"
                    style={{ backgroundColor: guide.colors[key] }}
                  />
                  <span className="text-[9px] text-gray-400 leading-none">{label}</span>
                </div>
              ))}
            </div>
          </ZoneCard>

          {/* TYPOGRAPHY — side by side */}
          <div className="grid grid-cols-2 gap-2.5">
            <ZoneCard title="Titre" onClick={() => setActiveModal("heading")}>
              <p
                className="text-lg font-bold text-gray-800 truncate leading-tight"
                style={{ fontFamily: guide.fonts.heading }}
              >
                {guide.fonts.heading}
              </p>
            </ZoneCard>
            <ZoneCard title="Corps" onClick={() => setActiveModal("body")}>
              <p
                className="text-sm text-gray-600 truncate leading-tight"
                style={{ fontFamily: guide.fonts.body }}
              >
                {guide.fonts.body}
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5" style={{ fontFamily: guide.fonts.body }}>
                Aa Bb Cc
              </p>
            </ZoneCard>
          </div>

          {/* BUTTONS + CARDS — side by side */}
          <div className="grid grid-cols-2 gap-2.5">
            <ZoneCard title="Boutons" onClick={() => setActiveModal("buttons")}>
              <div
                className="inline-flex items-center justify-center text-xs font-semibold"
                style={{
                  borderRadius: guide.buttons.borderRadius,
                  padding: guide.buttons.padding,
                  backgroundColor:
                    guide.buttons.style === "soft"
                      ? guide.colors.primary + "22"
                      : guide.buttons.style === "filled"
                      ? guide.colors.primary
                      : "transparent",
                  color:
                    guide.buttons.style === "filled"
                      ? isLight(guide.colors.primary) ? "#111" : "#fff"
                      : guide.colors.primary,
                  border:
                    guide.buttons.style === "outline"
                      ? `1.5px solid ${guide.colors.primary}`
                      : "none",
                  fontFamily: guide.fonts.body,
                }}
              >
                Bouton
              </div>
            </ZoneCard>
            <ZoneCard title="Cartes" onClick={() => setActiveModal("cards")}>
              <div className="flex gap-1.5">
                {["#EBF5FB", "#E9F7EF", "#F5EEF8"].map((bg, i) => (
                  <div
                    key={i}
                    className="flex-1 h-8"
                    style={{
                      backgroundColor: bg,
                      borderRadius: guide.cards.borderRadius,
                      boxShadow: {
                        none: "none",
                        sm: "0 1px 2px rgba(0,0,0,0.06)",
                        md: "0 4px 6px rgba(0,0,0,0.08)",
                        lg: "0 8px 12px rgba(0,0,0,0.1)",
                      }[guide.cards.shadow] ?? "none",
                    }}
                  />
                ))}
              </div>
            </ZoneCard>
          </div>

          {/* SPACING — compact inline (no modal needed) */}
          <div className="border border-gray-200 rounded-xl p-3.5">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block mb-3">
              Espacement
            </span>
            <div className="space-y-3">
              {(
                [
                  { label: "Section padding", key: "sectionPadding" as const, min: 40, max: 160 },
                  { label: "Gap éléments", key: "elementGap" as const, min: 8, max: 64 },
                ]
              ).map(({ label, key, min, max }) => (
                <div key={key}>
                  <div className="flex justify-between mb-1">
                    <span className="text-[11px] text-gray-500">{label}</span>
                    <span className="text-[11px] font-mono text-gray-400">{guide.spacing[key]}</span>
                  </div>
                  <input
                    type="range"
                    min={min}
                    max={max}
                    value={parseInt(guide.spacing[key])}
                    onChange={(e) =>
                      dispatch({
                        type: "UPDATE_STYLE_GUIDE",
                        payload: { spacing: { ...guide.spacing, [key]: `${e.target.value}px` } },
                      })
                    }
                    className="w-full accent-gray-900"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Reset */}
          <button
            onClick={() =>
              dispatch({
                type: "UPDATE_STYLE_GUIDE",
                payload: {
                  colors: {
                    primary: "#1a56db",
                    secondary: "#6875f5",
                    accent: "#e3a008",
                    background: "#ffffff",
                    backgroundAlt: "#f9fafb",
                    text: "#111827",
                    textMuted: "#6b7280",
                  },
                },
              })
            }
            className="w-full text-[11px] text-gray-400 hover:text-gray-600 transition-colors py-2 border border-gray-100 rounded-lg hover:bg-gray-50"
          >
            Réinitialiser les couleurs
          </button>
        </div>
      </div>

      {/* ── Right: Live Preview ─────────────────────────────────────────────── */}
      {previewFullscreen ? (
        <div className="fixed inset-0 z-50 bg-gray-900/80 flex items-center justify-center p-8">
          <div className="relative w-full max-w-6xl max-h-full overflow-auto rounded-2xl shadow-2xl bg-white">
            <button
              onClick={() => setPreviewFullscreen(false)}
              className="absolute top-3 right-3 z-10 p-2 bg-black/20 hover:bg-black/30 rounded-lg text-white transition-colors"
            >
              <EyeOff size={14} />
            </button>
            {livePreview}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 bg-white/80 border-b border-gray-100 flex-shrink-0">
            <span className="text-xs font-medium text-gray-500">
              Aperçu en direct · page d&apos;accueil
            </span>
            <button
              onClick={() => setPreviewFullscreen(true)}
              className="p-1.5 hover:bg-gray-100 rounded-md text-gray-400 hover:text-gray-700 transition-colors"
              title="Plein écran"
            >
              <Eye size={14} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto bg-[#f5f5f5] p-4">
            <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm bg-white">
              {livePreview}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
