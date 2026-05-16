"use client";

import React from "react";
import { createPortal } from "react-dom";
import {
  X, Copy, Check, Shuffle, ChevronDown, Eye, EyeOff, Layers, Palette, Type as TypeIcon, MousePointer, Box,
  RefreshCw, AlertCircle, Search,
} from "lucide-react";
import type { StyleGuide, ButtonVariant, SiteSectionDef } from "@/types";
import { useRelumeBuilder } from "./RelumeBuilderProvider";
import { generateColorShades, isLightColor } from "@/lib/color-utils";
import {
  BUTTON_PRESETS,
  resolvePrimaryVariant,
  resolveSecondaryVariant,
  variantToCSSVars,
} from "@/lib/button-style";
import { DynamicSectionRenderer } from "../DynamicSectionRenderer";
import { Btn } from "./skin-primitives";

// ── Constants ─────────────────────────────────────────────────────────────────

const GOOGLE_FONTS = [
  // Serif éditorial (titres élégants)
  "Instrument Serif", "Fraunces", "Playfair Display", "Bodoni Moda", "DM Serif Display",
  "Cormorant Garamond", "Lora", "EB Garamond", "Crimson Pro", "PT Serif",
  "Merriweather", "Source Serif 4", "Libre Caslon Text",
  // Sans modernes (corps & UI)
  "Geist", "Inter", "DM Sans", "Plus Jakarta Sans", "Manrope", "Outfit",
  "Sora", "Space Grotesk", "Unbounded", "Work Sans", "Poppins", "Montserrat",
  "Nunito", "Nunito Sans", "Raleway", "Roboto", "Lato", "Open Sans",
  "Figtree", "Onest", "Geist Mono", "JetBrains Mono", "IBM Plex Sans",
  "IBM Plex Mono", "Albert Sans", "Be Vietnam Pro", "Hanken Grotesk", "Public Sans",
  // Display caractère (gros titres marqués)
  "Instrument Sans", "Anton", "Archivo Black", "Bebas Neue", "Oswald",
];

const COLOR_PALETTES = [
  { name: "Sunset orange",   hex: "#FF7043" },
  { name: "Cornflower Blue", hex: "#799DF3" },
  { name: "Manz",            hex: "#EFEF6D" },
  { name: "Malibu",          hex: "#74CEF2" },
  { name: "Mint",            hex: "#4CAF7D" },
  { name: "Lavender",        hex: "#A78BFA" },
  { name: "Rose",            hex: "#F43F5E" },
  { name: "Teal",            hex: "#14B8A6" },
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

/** Split a hex string into solid hex (#RRGGBB) and alpha 0..1. Falls back to (input, 1). */
function splitHexAlpha(hex: string): { solid: string; alpha: number } {
  if (!hex) return { solid: "#000000", alpha: 1 };
  if (hex.length === 9) {
    const solid = hex.slice(0, 7);
    const aa = hex.slice(7, 9);
    const alpha = parseInt(aa, 16) / 255;
    return { solid, alpha: isNaN(alpha) ? 1 : alpha };
  }
  if (hex.length === 4) {
    // #rgb → #rrggbb
    const r = hex[1], g = hex[2], b = hex[3];
    return { solid: `#${r}${r}${g}${g}${b}${b}`, alpha: 1 };
  }
  return { solid: hex, alpha: 1 };
}

/** Compose a hex+alpha string. If alpha==1, returns #RRGGBB. Otherwise #RRGGBBAA. */
function composeHexAlpha(solid: string, alpha: number): string {
  if (!isValidHex(solid)) return solid;
  const clamped = Math.max(0, Math.min(1, alpha));
  if (clamped >= 1) return solid.length === 9 ? solid.slice(0, 7) : solid;
  const aa = Math.round(clamped * 255).toString(16).padStart(2, "0");
  const base = solid.length === 9 ? solid.slice(0, 7) : solid;
  return `${base}${aa}`;
}

/** Render a color with an underlying checker to convey alpha. */
function ColorChip({ value, size = 28, className }: { value: string; size?: number; className?: string }) {
  return (
    <div
      className={className}
      style={{
        display: "inline-block",
        width: size,
        height: size,
        boxSizing: "border-box",
        borderRadius: size <= 22 ? 5 : 7,
        flexShrink: 0,
        flexGrow: 0,
        border: "1.5px solid var(--surface)",
        boxShadow: "0 0 0 1px var(--border-2), 0 1px 2px rgba(20,18,14,.06)",
        backgroundImage:
          `linear-gradient(${value}, ${value}), ` +
          "conic-gradient(rgba(20,18,14,.14) 25%, transparent 0 50%, rgba(20,18,14,.14) 0 75%, transparent 0)",
        backgroundSize: "100% 100%, 8px 8px",
        backgroundPosition: "0 0, 0 0",
      }}
    />
  );
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
      // Request italic 400 too — fonts without italics fall back gracefully on Google's side.
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap`;
      document.head.appendChild(link);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

// ── Modal Wrapper ─────────────────────────────────────────────────────────────

function Modal({
  size = "md",
  title,
  subtitle,
  icon,
  iconKind = "accent",
  onClose,
  footer,
  children,
}: {
  size?: "sm" | "md" | "lg" | "xl";
  title: string;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  iconKind?: "accent" | "magic" | "info";
  onClose: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  // Close on Escape
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;

  // Portal to body to avoid breaking parent layouts (grid/flex) of the workspace.
  return createPortal(
    <div className="sb-skin">
      <div className="modal-backdrop" onClick={onClose}>
        <div className={`modal-shell ${size}`} onClick={(e) => e.stopPropagation()}>
          <div className="modal-hd">
            {icon && <div className={`ic-wrap ${iconKind === "accent" ? "" : iconKind}`}>{icon}</div>}
            <div className="grow">
              <div className="title">{title}</div>
              {subtitle && <div className="subtitle">{subtitle}</div>}
            </div>
            <button onClick={onClose} className="btn ghost sm icon" title="Fermer">
              <X size={13} />
            </button>
          </div>
          {children}
          {footer && <div className="modal-ft">{footer}</div>}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Hex Color Input ───────────────────────────────────────────────────────────

/**
 * Color input with hex text field, opacity slider, copy button.
 * Stores values as #RRGGBB or #RRGGBBAA. Setting alpha to < 1 produces the 8-char form.
 * The chip itself is decorative — clicking it does nothing. The system color picker
 * is intentionally hidden: typing the hex is the primary editing path.
 */
function HexColorInput({
  label,
  hint,
  value,
  onChange,
  showOpacity = true,
  compact = false,
}: {
  label?: string;
  hint?: React.ReactNode;
  value: string;
  onChange: (hex: string) => void;
  showOpacity?: boolean;
  compact?: boolean;
}) {
  const { solid, alpha } = splitHexAlpha(value || "#000000");
  const [draft, setDraft] = React.useState(value);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => { setDraft(value); }, [value]);

  const commit = (v: string) => {
    const trimmed = v.trim();
    const clean = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
    if (isValidHex(clean)) { onChange(clean); setDraft(clean); }
    else setDraft(value);
  };

  const setAlpha = (a: number) => onChange(composeHexAlpha(solid, a));

  const copy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };

  const chipSize = compact ? 24 : 28;

  return (
    <div>
      {(label || hint) && (
        <div className="field-label">
          {label && <span>{label}</span>}
          {hint && <span className="hint">{hint}</span>}
        </div>
      )}
      <div className="hex-input-row">
        <ColorChip value={value} size={chipSize} />
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") commit((e.target as HTMLInputElement).value); }}
          placeholder="#000000"
          spellCheck={false}
          className="input mono"
          style={{ flex: 1, minWidth: 0, height: chipSize, fontSize: compact ? 11 : 12 }}
        />
        <button onClick={copy} className="btn ghost xs icon" title="Copier #hex">
          {copied ? <Check size={11} style={{ color: "var(--ok)" }} /> : <Copy size={11} />}
        </button>
      </div>
      {showOpacity && (
        <div className="range-row" style={{ marginTop: 6 }}>
          <label style={{ fontSize: 10.5, color: "var(--text-4)", width: 56, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: ".04em" }}>Opacité</label>
          <input
            type="range" min={0} max={100} value={Math.round(alpha * 100)}
            onChange={(e) => setAlpha(Number(e.target.value) / 100)}
          />
          <span className="val" style={{ fontSize: 10.5, width: 38 }}>{Math.round(alpha * 100)}%</span>
        </div>
      )}
    </div>
  );
}

// ── Shade Strip ───────────────────────────────────────────────────────────────

function ShadeStrip({ label, baseHex }: { label: string; baseHex: string }) {
  const [copiedHex, setCopiedHex] = React.useState<string | null>(null);
  const { solid } = splitHexAlpha(baseHex);
  const shades = React.useMemo(() => generateColorShades(solid), [solid]);

  const copyHex = (hex: string) => {
    navigator.clipboard.writeText(hex).then(() => {
      setCopiedHex(hex);
      setTimeout(() => setCopiedHex(null), 1200);
    });
  };

  return (
    <div>
      <div style={{ fontSize: 10.5, color: "var(--text-4)", fontFamily: "var(--font-mono)", marginBottom: 4 }}>{label}</div>
      <div className="shade-strip">
        {SHADE_STOPS.map((stop) => (
          <div
            key={stop}
            style={{
              background: shades[stop],
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "default",
            }}
            title={`${stop} · ${shades[stop]}`}
            onClick={() => copyHex(shades[stop])}
          >
            {copiedHex === shades[stop] && (
              <Check size={9} style={{ color: isLightColor(shades[stop]) ? "#000" : "#fff" }} />
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
  icon,
  onClick,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  onClick: () => void;
  children?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="zone-card"
      style={{ width: "100%", textAlign: "left", appearance: "none", font: "inherit", color: "inherit" }}
    >
      <div className="zh">
        <span style={{ display: "flex", alignItems: "center" }}>
          {icon && <span className="ic-wrap">{icon}</span>}
          {title}
        </span>
        <ChevronDown size={11} style={{ color: "var(--text-4)", transform: "rotate(-90deg)" }} />
      </div>
      {children}
    </button>
  );
}

// ── Modal: Colors ─────────────────────────────────────────────────────────────

function ColorsModal({
  guide,
  onUpdate,
  onReset,
  onClose,
}: {
  guide: StyleGuide;
  onUpdate: (key: keyof StyleGuide["colors"], v: string) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      size="md"
      title="Couleurs"
      subtitle="Marque, fonds et textes. Cliquez une nuance pour copier son hex."
      icon={<Palette size={14} />} iconKind="accent"
      onClose={onClose}
      footer={
        <>
          <Btn variant="ghost" onClick={onReset}><RefreshCw size={12} />Réinitialiser</Btn>
          <span style={{ flex: 1 }} />
          <Btn variant="outline" onClick={onClose}>Fermer</Btn>
        </>
      }
    >
      <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {/* Brand colors header */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div className="field-label" style={{ marginBottom: 0 }}><span>Couleurs de marque</span></div>
            <Btn variant="outline" size="xs"
              onClick={() => {
                const p = COLOR_PALETTES[Math.floor(Math.random() * COLOR_PALETTES.length)];
                onUpdate("primary", p.hex);
              }}>
              <Shuffle size={10} />Aléatoire
            </Btn>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {(["primary", "secondary", "accent"] as const).map((key) => (
              <HexColorInput
                key={key}
                label={{ primary: "Primaire", secondary: "Secondaire", accent: "Accent" }[key]}
                value={guide.colors[key]}
                onChange={(v) => onUpdate(key, v)}
              />
            ))}
          </div>
        </div>

        {/* BG + text colors */}
        <div>
          <div className="field-label"><span>Fonds &amp; texte</span></div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
            {(
              [
                ["background", "Fond"],
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
        </div>

        {/* Shade strips */}
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
          <div className="field-label" style={{ display: "flex", alignItems: "center" }}>
            <span>Nuances générées</span>
            <span className="hint">cliquer pour copier</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {([
              ["Primaire", guide.colors.primary],
              ["Secondaire", guide.colors.secondary],
              ["Accent", guide.colors.accent],
            ] as const).map(([label, hex]) => (
              <ShadeStrip key={label} label={label} baseHex={hex} />
            ))}
          </div>
        </div>

        {/* Palette chips */}
        <div>
          <div className="field-label"><span>Palettes suggérées</span></div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {COLOR_PALETTES.map((p) => (
              <button
                key={p.hex}
                onClick={() => onUpdate("primary", p.hex)}
                title={p.name}
                style={{
                  width: 30, height: 30, borderRadius: "50%",
                  border: "2px solid var(--surface)",
                  boxShadow: "0 0 0 1px var(--border-2), 0 1px 3px rgba(20,18,14,.08)",
                  background: p.hex,
                  cursor: "default",
                }}
              />
            ))}
          </div>
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
  const isHead = role === "heading";
  const current = isHead ? guide.fonts.heading : guide.fonts.body;
  const [search, setSearch] = React.useState("");
  const filtered = GOOGLE_FONTS.filter((f) => f.toLowerCase().includes(search.toLowerCase()));
  const fallback = isHead ? "serif" : "sans-serif";

  // Load all list fonts so previews render
  useGoogleFonts(GOOGLE_FONTS);

  return (
    <Modal
      size="sm"
      title={isHead ? "Police de titres" : "Police de corps"}
      subtitle="Google Fonts · chargée à la publication."
      icon={<TypeIcon size={14} />}
      iconKind="accent"
      onClose={onClose}
      footer={
        <>
          <Btn variant="ghost" size="xs"
            onClick={() => {
              const f = GOOGLE_FONTS[Math.floor(Math.random() * GOOGLE_FONTS.length)];
              onUpdate(f);
            }}>
            <Shuffle size={10} />Aléatoire
          </Btn>
          <span style={{ flex: 1 }} />
          <Btn variant="outline" onClick={onClose}>Fermer</Btn>
        </>
      }
    >
      <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Search */}
        <div className="modal-search" style={{ padding: 0, borderBottom: 0 }}>
          <div className="search-wrap" style={{ flex: 1, position: "relative" }}>
            <Search size={12} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--text-4)" }} />
            <input
              autoFocus
              className="input"
              placeholder="Rechercher une police…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Current font preview */}
        <div
          style={{
            padding: 14,
            background: "var(--bg-2)",
            borderRadius: 10,
            border: "1px solid var(--border)",
          }}
        >
          <div style={{ fontFamily: `"${current}", ${fallback}`, fontSize: isHead ? 36 : 20, color: "var(--text)", lineHeight: 1.1 }}>
            {isHead ? "Aa Bb · Une eau qui ne lâche jamais." : "The quick brown fox jumps over the lazy dog."}
          </div>
          <div style={{ fontFamily: `"${current}", ${fallback}`, fontSize: 12, color: "var(--text-3)", marginTop: 6, fontVariantNumeric: "tabular-nums" }}>
            {current} · 0123456789 · &amp; @ # → ←
          </div>
        </div>

        {/* Base size info (body only) */}
        {role === "body" && (
          <div className="field" style={{ margin: 0 }}>
            <div className="field-label">
              <span>Taille de base</span>
              <span className="hint">{guide.fonts.baseSize}</span>
            </div>
            <div style={{ fontSize: 10.5, color: "var(--text-4)", lineHeight: 1.4 }}>
              Modifiable dans l&apos;onglet Espacement de la page Style Guide.
            </div>
          </div>
        )}

        {/* Font list */}
        <div style={{ maxHeight: 240, overflow: "auto", border: "1px solid var(--border)", borderRadius: 8 }}>
          {filtered.map((f) => (
            <button
              key={f}
              onClick={() => onUpdate(f)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 12px",
                border: 0,
                borderBottom: "1px solid var(--border)",
                background: f === current ? "var(--text)" : "transparent",
                color: f === current ? "var(--bg)" : "var(--text)",
                cursor: "default",
                fontFamily: `"${f}", ${fallback}`,
                fontSize: 14,
                textAlign: "left",
              }}
            >
              <span>{f}</span>
              {f === current && <Check size={12} />}
            </button>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: 16, textAlign: "center", color: "var(--text-4)", fontSize: 11 }}>Aucune police trouvée</div>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ── Variant Editor ────────────────────────────────────────────────────────────

function ShadowInput({
  shadow,
  onChange,
}: {
  shadow: ButtonVariant["shadow"];
  onChange: (s: ButtonVariant["shadow"]) => void;
}) {
  const s = shadow ?? { x: 0, y: 4, blur: 12, spread: 0, color: "rgba(0,0,0,0.15)" };
  const enabled = !!shadow;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-gray-500">Ombre</label>
        <button
          onClick={() => onChange(enabled ? null : s)}
          className={`relative w-9 h-5 rounded-full transition-colors ${enabled ? "bg-gray-900" : "bg-gray-200"}`}
        >
          <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${enabled ? "translate-x-4" : "translate-x-0.5"}`} />
        </button>
      </div>
      {enabled && (
        <div className="space-y-2 pl-1">
          {(["x", "y", "blur", "spread"] as const).map((k) => (
            <div key={k} className="flex items-center gap-2">
              <span className="text-[10px] text-gray-400 w-10 shrink-0">{k === "x" ? "X" : k === "y" ? "Y" : k === "blur" ? "Flou" : "Étale"}</span>
              <input
                type="range"
                min={k === "x" || k === "y" ? -20 : 0}
                max={k === "blur" ? 40 : k === "spread" ? 20 : 20}
                value={s[k]}
                onChange={(e) => onChange({ ...s, [k]: Number(e.target.value) })}
                className="flex-1 accent-gray-900"
              />
              <span className="text-[10px] font-mono text-gray-400 w-7 text-right">{s[k]}px</span>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-400 w-10 shrink-0">Couleur</span>
            <div className="relative">
              <div className="w-7 h-5 rounded border border-gray-200" style={{ backgroundColor: s.color }} />
              <input
                type="color"
                value={s.color.startsWith("rgba") ? "#888888" : s.color}
                onChange={(e) => onChange({ ...s, color: e.target.value + "40" })}
                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
              />
            </div>
            <input
              type="text"
              value={s.color}
              onChange={(e) => onChange({ ...s, color: e.target.value })}
              className="flex-1 border border-gray-200 rounded px-2 py-1 text-[10px] font-mono focus:outline-none focus:border-blue-400"
              placeholder="rgba(0,0,0,0.15)"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function VariantEditor({
  label,
  variant,
  baseColor,
  onChange,
}: {
  label: string;
  variant: ButtonVariant;
  baseColor: string;
  onChange: (v: Partial<ButtonVariant>) => void;
}) {
  const styles: Array<{ id: ButtonVariant["style"]; label: string }> = [
    { id: "filled", label: "Plein" },
    { id: "outline", label: "Contour" },
    { id: "soft", label: "Doux" },
    { id: "ghost", label: "Ghost" },
  ];

  // Resolve preview colors
  const vars = variantToCSSVars(variant, baseColor, "--p");

  const previewStyle: React.CSSProperties = {
    backgroundColor: vars["--p-bg"],
    color: vars["--p-text"],
    border: `${variant.borderWidth} solid ${vars["--p-border-color"]}`,
    borderRadius: variant.borderRadius,
    padding: variant.padding,
    boxShadow: vars["--p-shadow"] === "none" ? undefined : vars["--p-shadow"],
    fontFamily: "Inter, sans-serif",
    fontSize: 12,
    fontWeight: 600,
    display: "inline-flex",
    alignItems: "center",
    cursor: "default",
    userSelect: "none",
  };

  return (
    <div className="space-y-3">
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>

      {/* Style */}
      <div className="flex gap-1.5">
        {styles.map((s) => (
          <button
            key={s.id}
            onClick={() => onChange({ style: s.id })}
            className={`flex-1 py-1.5 text-[10px] rounded-lg border transition-colors ${
              variant.style === s.id
                ? "bg-gray-900 text-white border-gray-900"
                : "border-gray-200 text-gray-500 hover:bg-gray-50"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Color overrides */}
      <div className="grid grid-cols-3 gap-2">
        {(["bg", "text", "borderColor"] as const).map((field) => {
          const fieldLabel = { bg: "Fond", text: "Texte", borderColor: "Bordure" }[field];
          const autoVal = vars[`--p-${field === "borderColor" ? "border-color" : field}`];
          const current = variant[field] ?? autoVal;
          return (
            <div key={field} className="space-y-1">
              <label className="text-[9px] text-gray-400">{fieldLabel}</label>
              <div className="flex items-center gap-1">
                <div className="relative">
                  <div className="w-6 h-6 rounded border border-gray-200" style={{ backgroundColor: current }} />
                  <input
                    type="color"
                    value={current}
                    onChange={(e) => onChange({ [field]: e.target.value })}
                    className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                  />
                </div>
                {variant[field] && (
                  <button
                    onClick={() => onChange({ [field]: undefined })}
                    title="Auto"
                    className="text-[9px] text-gray-300 hover:text-red-400"
                  >✕</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Border width */}
      <div className="flex items-center gap-3">
        <label className="text-[10px] text-gray-400 w-20 shrink-0">Bordure</label>
        <input
          type="range" min={0} max={6}
          value={parseInt(variant.borderWidth)}
          onChange={(e) => onChange({ borderWidth: `${e.target.value}px` })}
          className="flex-1 accent-gray-900"
        />
        <span className="text-[10px] font-mono text-gray-400 w-7 text-right">{variant.borderWidth}</span>
      </div>

      {/* Border radius */}
      <div>
        <div className="flex items-center gap-3 mb-1.5">
          <label className="text-[10px] text-gray-400 w-20 shrink-0">Arrondi</label>
          <input
            type="range" min={0} max={32}
            value={Math.min(parseInt(variant.borderRadius), 32)}
            onChange={(e) => onChange({ borderRadius: `${e.target.value}px` })}
            className="flex-1 accent-gray-900"
          />
          <span className="text-[10px] font-mono text-gray-400 w-10 text-right">{variant.borderRadius}</span>
        </div>
        <div className="flex gap-1.5">
          {[{ l: "Carré", v: "0px" }, { l: "Sm", v: "4px" }, { l: "Md", v: "8px" }, { l: "Lg", v: "16px" }, { l: "Pilule", v: "999px" }].map(({ l, v }) => (
            <button key={v} onClick={() => onChange({ borderRadius: v })}
              className={`flex-1 py-1 text-[9px] rounded border transition-colors ${variant.borderRadius === v ? "bg-gray-900 text-white border-gray-900" : "border-gray-200 text-gray-400 hover:bg-gray-50"}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Padding */}
      <div className="flex items-center gap-3">
        <label className="text-[10px] text-gray-400 w-20 shrink-0">Padding</label>
        <input
          type="text"
          value={variant.padding}
          onChange={(e) => onChange({ padding: e.target.value })}
          className="flex-1 border border-gray-200 rounded px-2 py-1 text-[10px] font-mono focus:outline-none focus:border-blue-400"
          placeholder="12px 24px"
        />
      </div>

      {/* Shadow */}
      <ShadowInput shadow={variant.shadow} onChange={(s) => onChange({ shadow: s })} />

      {/* Preview */}
      <div className="flex items-center gap-3 pt-1">
        <span className="text-[10px] text-gray-400">Aperçu</span>
        <div style={previewStyle}>Bouton CTA</div>
      </div>
    </div>
  );
}

/**
 * Compact color override cell used inside the 3-col grid of the Buttons modal.
 * Stacks: label + (mini "auto" link), small hex input row, mini opacity slider.
 * Designed to fit ~160px width without overflowing.
 */
function CompactColorOverride({
  label,
  value,
  isOverridden,
  onChange,
  onClear,
}: {
  label: string;
  value: string;
  isOverridden: boolean;
  onChange: (hex: string) => void;
  onClear: () => void;
}) {
  const { solid, alpha } = splitHexAlpha(value || "#000000");
  const [draft, setDraft] = React.useState(value);
  React.useEffect(() => { setDraft(value); }, [value]);

  const commit = (v: string) => {
    const trimmed = v.trim();
    const clean = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
    if (isValidHex(clean)) { onChange(clean); setDraft(clean); }
    else setDraft(value);
  };
  const setAlpha = (a: number) => onChange(composeHexAlpha(solid, a));

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, minWidth: 0 }}>
        <span style={{ fontSize: 10, color: "var(--text-4)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</span>
        {isOverridden && (
          <button
            onClick={onClear}
            title="Revenir à la couleur de marque"
            style={{ fontSize: 9, color: "var(--text-3)", border: 0, background: "transparent", cursor: "default", padding: 0, fontFamily: "var(--font-mono)" }}
          >Auto</button>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
        <ColorChip value={value} size={22} />
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") commit((e.target as HTMLInputElement).value); }}
          spellCheck={false}
          className="input mono"
          style={{ flex: 1, minWidth: 0, height: 22, padding: "0 4px", fontSize: 10.5 }}
        />
      </div>
      <input
        type="range" min={0} max={100} value={Math.round(alpha * 100)}
        onChange={(e) => setAlpha(Number(e.target.value) / 100)}
        title={`Opacité ${Math.round(alpha * 100)}%`}
        style={{ width: "100%", marginTop: 6 }}
      />
    </div>
  );
}

// ── Modal: Buttons ────────────────────────────────────────────────────────────

const BUTTON_STYLES: Array<{ id: ButtonVariant["style"]; label: string }> = [
  { id: "filled", label: "Plein" },
  { id: "outline", label: "Contour" },
  { id: "soft", label: "Doux" },
  { id: "ghost", label: "Ghost" },
];

const RADIUS_PRESETS: Array<{ l: string; v: string }> = [
  { l: "Carré", v: "0px" },
  { l: "Sm", v: "4px" },
  { l: "Md", v: "8px" },
  { l: "Lg", v: "16px" },
  { l: "Pilule", v: "999px" },
];

function ButtonsModal({
  guide,
  onUpdate,
  onClose,
}: {
  guide: StyleGuide;
  onUpdate: (updates: Partial<StyleGuide["buttons"]>) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = React.useState<"primary" | "secondary">("primary");
  const primary = resolvePrimaryVariant(guide);
  const secondary = resolveSecondaryVariant(guide);
  const currentPreset = guide.buttons.preset ?? "modern";

  const applyPreset = (id: string) => {
    const preset = BUTTON_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    onUpdate({
      style: preset.primary.style === "ghost" ? "outline" : preset.primary.style,
      borderRadius: preset.primary.borderRadius,
      padding: preset.primary.padding,
      primary: preset.primary,
      secondary: preset.secondary,
      preset: id,
    });
  };

  const updatePrimary = (updates: Partial<ButtonVariant>) => {
    const merged = { ...primary, ...updates };
    onUpdate({
      style: merged.style === "ghost" ? "outline" : merged.style,
      borderRadius: merged.borderRadius,
      padding: merged.padding,
      primary: merged,
      preset: "custom",
    });
  };

  const updateSecondary = (updates: Partial<ButtonVariant>) => {
    onUpdate({ secondary: { ...secondary, ...updates }, preset: "custom" });
  };

  const v = tab === "primary" ? primary : secondary;
  const updateV = tab === "primary" ? updatePrimary : updateSecondary;
  const baseColor = tab === "primary" ? guide.colors.primary : guide.colors.secondary;
  const vars = variantToCSSVars(v, baseColor, "--v");

  const radiusNum = Math.min(parseInt(v.borderRadius), 32);
  const borderWidthNum = parseInt(v.borderWidth);
  const shadowEnabled = !!v.shadow;

  return (
    <Modal
      size="md" title="Boutons CTA"
      subtitle="Configure les styles cta-primary et cta-secondary appliqués sur tout le site."
      icon={<MousePointer size={14} />} iconKind="accent"
      onClose={onClose}
      footer={
        <>
          <span style={{ flex: 1 }} />
          <Btn variant="outline" onClick={onClose}>Fermer</Btn>
        </>
      }
    >
      <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Preset */}
        <div>
          <div className="field-label"><span>Preset</span></div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
            {BUTTON_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => applyPreset(p.id)}
                className="btn outline xs"
                style={{
                  height: 30, justifyContent: "center",
                  background: currentPreset === p.id ? "var(--text)" : "var(--surface)",
                  color: currentPreset === p.id ? "var(--bg)" : "var(--text)",
                  borderColor: currentPreset === p.id ? "var(--text)" : "var(--border-2)",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          {currentPreset === "custom" && (
            <div style={{ marginTop: 6, fontSize: 10.5, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
              Mode personnalisé — Custom
            </div>
          )}
        </div>

        {/* Tab switcher — primary / secondary */}
        <div className="seg full" role="tablist" aria-label="Variante de bouton">
          {(["primary", "secondary"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-pressed={tab === t ? "true" : "false"}
              onClick={() => setTab(t)}
            >
              {t === "primary" ? "Bouton principal" : "Bouton secondaire"}
            </button>
          ))}
        </div>

        {/* Style row */}
        <div>
          <div className="field-label"><span>Style</span></div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
            {BUTTON_STYLES.map((s) => (
              <button
                key={s.id}
                onClick={() => updateV({ style: s.id })}
                className="btn outline xs"
                style={{
                  height: 28, justifyContent: "center",
                  background: v.style === s.id ? "var(--text)" : "var(--surface)",
                  color: v.style === s.id ? "var(--bg)" : "var(--text)",
                  borderColor: v.style === s.id ? "var(--text)" : "var(--border-2)",
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Color overrides — Fond / Texte / Bordure all on one row */}
        <div>
          <div className="field-label">
            <span>Couleurs (override)</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
            {(["bg", "text", "borderColor"] as const).map((field) => {
              const fieldLabel = { bg: "Fond", text: "Texte", borderColor: "Bordure" }[field];
              const autoKey = (field === "borderColor" ? "--v-border-color" : `--v-${field}`) as `--v-${string}`;
              const current = v[field] ?? vars[autoKey];
              const isOverridden = !!v[field];
              return (
                <CompactColorOverride
                  key={field}
                  label={fieldLabel}
                  value={current}
                  isOverridden={isOverridden}
                  onChange={(hex) => updateV({ [field]: hex } as Partial<ButtonVariant>)}
                  onClear={() => updateV({ [field]: undefined } as Partial<ButtonVariant>)}
                />
              );
            })}
          </div>
        </div>

        {/* Radius */}
        <div>
          <div className="range-row">
            <label>Arrondi</label>
            <input type="range" min={0} max={32} value={radiusNum} onChange={(e) => updateV({ borderRadius: `${e.target.value}px` })} />
            <span className="val">{v.borderRadius}</span>
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            {RADIUS_PRESETS.map(({ l, v: rv }) => (
              <button
                key={rv}
                onClick={() => updateV({ borderRadius: rv })}
                className="btn outline xs"
                style={{
                  flex: 1, justifyContent: "center", height: 26,
                  background: v.borderRadius === rv ? "var(--text)" : "var(--surface)",
                  color: v.borderRadius === rv ? "var(--bg)" : "var(--text-2)",
                  borderColor: v.borderRadius === rv ? "var(--text)" : "var(--border-2)",
                }}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Border width */}
        <div className="range-row">
          <label>Bordure</label>
          <input type="range" min={0} max={6} value={borderWidthNum} onChange={(e) => updateV({ borderWidth: `${e.target.value}px` })} />
          <span className="val">{v.borderWidth}</span>
        </div>

        {/* Padding */}
        <div className="field" style={{ margin: 0 }}>
          <div className="field-label"><span>Padding</span></div>
          <input
            className="input mono"
            value={v.padding}
            onChange={(e) => updateV({ padding: e.target.value })}
            placeholder="12px 20px"
          />
        </div>

        {/* Shadow toggle */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: "var(--text)" }}>Ombre portée</div>
            <div style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 2 }}>Ajoute une légère ombre dynamique au survol.</div>
          </div>
          <button
            className="toggle"
            aria-checked={shadowEnabled ? "true" : "false"}
            onClick={() =>
              updateV({ shadow: shadowEnabled ? null : { x: 0, y: 4, blur: 12, spread: 0, color: "rgba(20,18,14,.15)" } })
            }
          />
        </div>

        {/* Preview */}
        <div
          style={{
            padding: 22,
            background: "var(--bg-2)",
            borderRadius: 8,
            border: "1px solid var(--border)",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: "var(--text-4)",
              marginBottom: 10,
              fontFamily: "var(--font-mono)",
              letterSpacing: ".06em",
              textTransform: "uppercase",
            }}
          >
            Aperçu
          </div>
          <div style={{ display: "inline-flex", gap: 10, justifyContent: "center" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: vars["--v-bg"],
                color: vars["--v-text"],
                border: `${v.borderWidth} solid ${vars["--v-border-color"]}`,
                padding: v.padding,
                borderRadius: v.borderRadius,
                fontSize: 13,
                fontWeight: 600,
                boxShadow: vars["--v-shadow"] === "none" ? undefined : vars["--v-shadow"],
              }}
            >
              {tab === "primary" ? "Demander un devis" : "En savoir plus"} →
            </span>
          </div>
        </div>

        {/* Convention */}
        <div className="alert-soft info">
          <AlertCircle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            <strong>Convention :</strong> ajoutez{" "}
            <code style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "rgba(42,111,219,.15)", padding: "1px 4px", borderRadius: 3 }}>cta-primary</code>
            {" "}ou{" "}
            <code style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "rgba(42,111,219,.15)", padding: "1px 4px", borderRadius: 3 }}>cta-secondary</code>
            {" "}sur vos boutons d&apos;action pour appliquer ce style.
          </span>
        </div>
      </div>
    </Modal>
  );
}

// ── Modal: Cards ──────────────────────────────────────────────────────────────

const CARD_SHADOW_PRESETS: Record<string, string> = {
  none: "none",
  sm: "0 1px 2px rgba(0,0,0,0.06)",
  md: "0 4px 6px rgba(0,0,0,0.1)",
  lg: "0 10px 15px rgba(0,0,0,0.1)",
};

function resolveCardShadowPreview(cards: StyleGuide["cards"]): string {
  if (cards.shadowCustom) {
    const s = cards.shadowCustom;
    return `${s.x}px ${s.y}px ${s.blur}px ${s.spread}px ${s.color}`;
  }
  return CARD_SHADOW_PRESETS[cards.shadow] ?? "none";
}

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
  const isCustomShadow = !!c.shadowCustom;
  const sc = c.shadowCustom ?? { x: 0, y: 4, blur: 12, spread: 0, color: "rgba(20,18,14,0.12)" };
  const radiusNum = parseInt(c.borderRadius);
  const imageRadiusNum = parseInt(c.imageRadius ?? c.borderRadius);
  const borderWidthNum = parseInt(c.borderWidth ?? "0");

  return (
    <Modal
      size="md"
      title="Cartes & images"
      subtitle="Apparence par défaut des cartes de feature, témoignages, blog, etc."
      icon={<Box size={14} />}
      iconKind="accent"
      onClose={onClose}
      footer={
        <>
          <span style={{ flex: 1 }} />
          <Btn variant="outline" onClick={onClose}>Fermer</Btn>
        </>
      }
    >
      <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Card radius */}
        <div className="range-row">
          <label>Arrondi cartes</label>
          <input type="range" min={0} max={32} value={radiusNum} onChange={(e) => onUpdate({ borderRadius: `${e.target.value}px` })} />
          <span className="val">{c.borderRadius}</span>
        </div>

        {/* Image radius */}
        <div className="range-row">
          <label>Arrondi images</label>
          <input type="range" min={0} max={32} value={imageRadiusNum} onChange={(e) => onUpdate({ imageRadius: `${e.target.value}px` })} />
          <span className="val">{c.imageRadius ?? c.borderRadius}</span>
        </div>

        {/* Shadow */}
        <div>
          <div className="field-label">
            <span>Ombre</span>
            <button
              onClick={() => onUpdate({ shadowCustom: isCustomShadow ? null : sc })}
              style={{
                marginLeft: "auto",
                fontSize: 10, padding: "2px 8px",
                border: "1px solid var(--border-2)",
                background: isCustomShadow ? "var(--text)" : "var(--surface)",
                color: isCustomShadow ? "var(--bg)" : "var(--text-3)",
                borderRadius: 4, cursor: "default",
                fontFamily: "var(--font-mono)",
              }}
            >
              {isCustomShadow ? "Personnalisée" : "Personnaliser"}
            </button>
          </div>
          {!isCustomShadow ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
              {(["none", "sm", "md", "lg"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => onUpdate({ shadow: s })}
                  className="btn outline xs"
                  style={{
                    height: 30, justifyContent: "center",
                    background: c.shadow === s ? "var(--text)" : "var(--surface)",
                    color: c.shadow === s ? "var(--bg)" : "var(--text)",
                    borderColor: c.shadow === s ? "var(--text)" : "var(--border-2)",
                  }}
                >
                  {s === "none" ? "Aucune" : s.toUpperCase()}
                </button>
              ))}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(
                [
                  { key: "x" as const, label: "Décalage X", min: -40, max: 40 },
                  { key: "y" as const, label: "Décalage Y", min: -20, max: 60 },
                  { key: "blur" as const, label: "Flou", min: 0, max: 80 },
                  { key: "spread" as const, label: "Extension", min: -20, max: 40 },
                ] as const
              ).map(({ key, label, min, max }) => (
                <div key={key} className="range-row">
                  <label>{label}</label>
                  <input type="range" min={min} max={max} value={sc[key]} onChange={(e) => onUpdate({ shadowCustom: { ...sc, [key]: Number(e.target.value) } })} />
                  <span className="val">{sc[key]}px</span>
                </div>
              ))}
              <HexColorInput
                label="Couleur d'ombre"
                value={sc.color.startsWith("rgba") ? "#14120E33" : sc.color}
                onChange={(hex) => onUpdate({ shadowCustom: { ...sc, color: hex } })}
              />
            </div>
          )}
        </div>

        {/* Border */}
        <div className="range-row">
          <label>Bordure</label>
          <input type="range" min={0} max={6} value={borderWidthNum} onChange={(e) => onUpdate({ borderWidth: `${e.target.value}px` })} />
          <span className="val">{c.borderWidth ?? "0px"}</span>
        </div>

        <HexColorInput
          label="Couleur de bordure"
          value={c.borderColor && !c.borderColor.startsWith("rgba") ? c.borderColor : "#14120E1F"}
          onChange={(hex) => onUpdate({ borderColor: hex })}
        />

        {/* Preview */}
        <div
          style={{
            padding: 22,
            background: "var(--bg-2)",
            borderRadius: 8,
            border: "1px solid var(--border)",
          }}
        >
          <div style={{ fontSize: 10, color: "var(--text-4)", marginBottom: 14, fontFamily: "var(--font-mono)", letterSpacing: ".06em", textTransform: "uppercase", textAlign: "center" }}>
            Aperçu
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {["#FFFAF2", "#FFEFE2", "#E9F1F8"].map((bg, i) => (
              <div
                key={i}
                style={{
                  background: bg,
                  borderRadius: c.borderRadius,
                  boxShadow: resolveCardShadowPreview(c),
                  border: `${c.borderWidth ?? "0px"} solid ${c.borderColor ?? "transparent"}`,
                  aspectRatio: "1 / 1",
                  padding: 10,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <div style={{ background: "rgba(20,18,14,.10)", borderRadius: c.imageRadius ?? c.borderRadius, height: "55%" }} />
                <div style={{ background: "rgba(20,18,14,.16)", borderRadius: 3, height: 8, width: "70%" }} />
                <div style={{ background: "rgba(20,18,14,.10)", borderRadius: 3, height: 6, width: "85%" }} />
              </div>
            ))}
          </div>
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
    <div className="sg-split" style={{ flex: 1, minHeight: 0 }}>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      {activeModal === "colors" && (
        <ColorsModal
          guide={guide}
          onUpdate={updateColor}
          onReset={() => dispatch({
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
          })}
          onClose={close}
        />
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
      <div className="sg-side">

        <div className="sg-side-hd">
          <span className="title">Style Guide</span>
          <span className="hint">Cliquez une zone</span>
        </div>

        <div className="sg-zones">

          {/* COLORS — full width zone */}
          <ZoneCard title="Couleurs" icon={<Palette size={11} />} onClick={() => setActiveModal("colors")}>
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
          <div className="zone-row-2">
            <ZoneCard title="Titre" icon={<TypeIcon size={11} />} onClick={() => setActiveModal("heading")}>
              <p
                className="text-lg font-bold text-gray-800 truncate leading-tight"
                style={{ fontFamily: guide.fonts.heading }}
              >
                {guide.fonts.heading}
              </p>
            </ZoneCard>
            <ZoneCard title="Corps" icon={<TypeIcon size={11} />} onClick={() => setActiveModal("body")}>
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
          <div className="zone-row-2">
            <ZoneCard title="Boutons CTA" icon={<MousePointer size={11} />} onClick={() => setActiveModal("buttons")}>
              <div className="flex flex-wrap gap-1.5">
                {/* Primary preview */}
                {(() => {
                  const p = resolvePrimaryVariant(guide);
                  const pv = variantToCSSVars(p, guide.colors.primary, "--p");
                  return (
                    <div
                      className="inline-flex items-center justify-center text-[10px] font-semibold"
                      style={{
                        borderRadius: p.borderRadius,
                        padding: "6px 12px",
                        backgroundColor: pv["--p-bg"],
                        color: pv["--p-text"],
                        border: `${p.borderWidth} solid ${pv["--p-border-color"]}`,
                      }}
                    >
                      Principal
                    </div>
                  );
                })()}
                {/* Secondary preview */}
                {(() => {
                  const s = resolveSecondaryVariant(guide);
                  const sv = variantToCSSVars(s, guide.colors.secondary, "--s");
                  return (
                    <div
                      className="inline-flex items-center justify-center text-[10px] font-semibold"
                      style={{
                        borderRadius: s.borderRadius,
                        padding: "6px 12px",
                        backgroundColor: sv["--s-bg"],
                        color: sv["--s-text"],
                        border: `${s.borderWidth} solid ${sv["--s-border-color"]}`,
                      }}
                    >
                      Secondaire
                    </div>
                  );
                })()}
                {guide.buttons.preset && guide.buttons.preset !== "custom" && (
                  <span className="text-[9px] text-gray-400 self-end">{guide.buttons.preset}</span>
                )}
              </div>
            </ZoneCard>
            <ZoneCard title="Cartes" icon={<Box size={11} />} onClick={() => setActiveModal("cards")}>
              <div className="flex gap-1.5">
                {["#EBF5FB", "#E9F7EF", "#F5EEF8"].map((bg, i) => (
                  <div
                    key={i}
                    className="flex-1 h-8"
                    style={{
                      backgroundColor: bg,
                      borderRadius: guide.cards.borderRadius,
                      boxShadow: resolveCardShadowPreview(guide.cards),
                      border: `${guide.cards.borderWidth ?? "0px"} solid ${guide.cards.borderColor ?? "transparent"}`,
                    }}
                  />
                ))}
              </div>
            </ZoneCard>
          </div>

          {/* SPACING — compact inline (no modal needed) */}
          <div className="zone-card">
            <div className="zh">
              <span style={{ display: "flex", alignItems: "center" }}>
                <span className="ic-wrap"><Layers size={11} /></span>
                Espacement
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {(
                [
                  { label: "Section padding", key: "sectionPadding" as const, min: 40, max: 160 },
                  { label: "Gap éléments", key: "elementGap" as const, min: 8, max: 64 },
                ]
              ).map(({ label, key, min, max }) => (
                <div key={key} className="range-row">
                  <label>{label}</label>
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
                  />
                  <span className="val">{guide.spacing[key]}</span>
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
            className="btn outline"
            style={{ width: "100%", justifyContent: "center", height: 32, color: "var(--text-3)" }}
          >
            Réinitialiser les couleurs
          </button>
        </div>
      </div>

      {/* ── Right: Live Preview ─────────────────────────────────────────────── */}
      {previewFullscreen ? (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(20, 18, 14, .6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 32 }}>
          <div style={{ position: "relative", width: "100%", maxWidth: 1100, maxHeight: "100%", overflow: "auto", borderRadius: 14, boxShadow: "var(--shadow-pop)", background: "#fff" }}>
            <button
              onClick={() => setPreviewFullscreen(false)}
              style={{ position: "absolute", top: 12, right: 12, zIndex: 10, padding: 8, background: "rgba(0,0,0,.25)", borderRadius: 8, color: "#fff", border: 0, cursor: "default" }}
            >
              <EyeOff size={14} />
            </button>
            {livePreview}
          </div>
        </div>
      ) : (
        <div className="sg-preview-host">
          <div className="sg-preview-bar">
            <span className="title">Aperçu en direct · page d&apos;accueil</span>
            <button
              onClick={() => setPreviewFullscreen(true)}
              className="btn ghost sm icon"
              title="Plein écran"
            >
              <Eye size={14} />
            </button>
          </div>
          <div className="sg-preview-frame">
            <div className="frame-inner">
              {livePreview}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
