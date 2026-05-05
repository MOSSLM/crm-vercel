"use client";

import React from "react";
import { X, Palette, Type, Square, StretchHorizontal, Settings2 } from "lucide-react";
import { cn } from "@/components/ui/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ThemeGlobalVariables, SiteGlobalSettings } from "@/types";

type Settings = ThemeGlobalVariables & { siteSettings?: SiteGlobalSettings };

interface SiteSettingsPanelProps {
  settings: Settings;
  onUpdate: (patch: Partial<Settings>) => void;
  onClose: () => void;
}

type Tab = "general" | "colors" | "typography" | "components" | "spacing";

const GOOGLE_FONTS = [
  "Inter", "Roboto", "Open Sans", "Lato", "Poppins",
  "Montserrat", "Raleway", "Nunito", "Source Sans 3",
  "Playfair Display", "Merriweather", "Lora",
  "Fira Sans", "Work Sans", "DM Sans",
];

const SHADOW_OPTIONS = [
  { value: "none", label: "Aucune" },
  { value: "sm", label: "Légère" },
  { value: "md", label: "Moyenne" },
  { value: "lg", label: "Forte" },
  { value: "xl", label: "Très forte" },
];

export default function SiteSettingsPanel({ settings, onUpdate, onClose }: SiteSettingsPanelProps) {
  const [tab, setTab] = React.useState<Tab>("general");

  const colors = settings.colors ?? { primary: "#1a56db", secondary: "#6b7280", accent: "#f59e0b", background: "#ffffff", text: "#111827" };
  const fonts = settings.fonts ?? { heading: "Inter", body: "Inter", baseSize: "16px" };
  const buttons = settings.buttons ?? { borderRadius: "8px", padding: "12px 24px", style: "filled" };
  const cards = settings.cards ?? { borderRadius: "8px", shadow: "md", padding: "24px" };
  const spacing = settings.spacing ?? { sectionPadding: "80px", elementGap: "24px" };
  const siteSettings = settings.siteSettings ?? {};

  const setColor = (key: keyof typeof colors, val: string) =>
    onUpdate({ colors: { ...colors, [key]: val } });

  const setFont = (key: keyof typeof fonts, val: string) =>
    onUpdate({ fonts: { ...fonts, [key]: val } });

  const setButtons = (key: keyof typeof buttons, val: string) =>
    onUpdate({ buttons: { ...buttons, [key]: val } });

  const setCards = (key: keyof typeof cards, val: string) =>
    onUpdate({ cards: { ...cards, [key]: val } });

  const setSpacing = (key: keyof typeof spacing, val: string) =>
    onUpdate({ spacing: { ...spacing, [key]: val } });

  const setSiteSettings = (patch: Partial<SiteGlobalSettings>) =>
    onUpdate({ siteSettings: { ...siteSettings, ...patch } });

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "general", label: "Général", icon: <Settings2 className="h-3.5 w-3.5" /> },
    { id: "colors", label: "Couleurs", icon: <Palette className="h-3.5 w-3.5" /> },
    { id: "typography", label: "Typo", icon: <Type className="h-3.5 w-3.5" /> },
    { id: "components", label: "Composants", icon: <Square className="h-3.5 w-3.5" /> },
    { id: "spacing", label: "Espaces", icon: <StretchHorizontal className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="w-80 flex-shrink-0 bg-[#18181b] border-l border-white/10 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-white/40" />
          <span className="text-sm font-semibold text-white">Paramètres du site</span>
        </div>
        <button type="button" className="p-1 rounded text-white/40 hover:text-white hover:bg-white/10" onClick={onClose}>
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={cn(
              "flex items-center gap-1 px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors border-b-2",
              tab === t.id
                ? "text-white border-blue-500"
                : "text-white/40 border-transparent hover:text-white/70"
            )}
            onClick={() => setTab(t.id)}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">

        {/* ── Général ── */}
        {tab === "general" && (
          <>
            <Section title="Meta du site (fallback)">
              <Field label="Meta titre">
                <Input
                  value={siteSettings.metaTitle ?? ""}
                  onChange={(e) => setSiteSettings({ metaTitle: e.target.value })}
                  placeholder="Mon super site"
                  className={inputClass}
                />
              </Field>
              <Field label="Meta description">
                <textarea
                  value={siteSettings.metaDescription ?? ""}
                  onChange={(e) => setSiteSettings({ metaDescription: e.target.value })}
                  placeholder="Description du site pour les moteurs de recherche…"
                  rows={3}
                  className="w-full text-xs bg-black/30 border border-white/10 rounded-md p-2 text-white/80 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-white/20"
                />
              </Field>
              <Field label="Favicon (URL)">
                <Input
                  value={siteSettings.faviconUrl ?? ""}
                  onChange={(e) => setSiteSettings({ faviconUrl: e.target.value })}
                  placeholder="https://..."
                  className={inputClass}
                />
              </Field>
            </Section>

            <Section title="Statut du site">
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/60">Site actif (visible)</span>
                <Toggle
                  value={siteSettings.isActive ?? true}
                  onChange={(v) => setSiteSettings({ isActive: v })}
                />
              </div>
            </Section>
          </>
        )}

        {/* ── Couleurs ── */}
        {tab === "colors" && (
          <Section title="Palette de couleurs">
            {(Object.entries(colors) as [keyof typeof colors, string][]).map(([key, val]) => (
              <ColorField
                key={key}
                label={COLOR_LABELS[key] ?? key}
                value={val}
                onChange={(v) => setColor(key, v)}
              />
            ))}
          </Section>
        )}

        {/* ── Typographie ── */}
        {tab === "typography" && (
          <>
            <Section title="Polices">
              <Field label="Police des titres">
                <FontSelect value={fonts.heading} onChange={(v) => setFont("heading", v)} />
              </Field>
              <Field label="Police du corps">
                <FontSelect value={fonts.body} onChange={(v) => setFont("body", v)} />
              </Field>
              <Field label="Taille de base">
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={parseInt(fonts.baseSize ?? "16")}
                    min={12}
                    max={24}
                    onChange={(e) => setFont("baseSize", `${e.target.value}px`)}
                    className={cn(inputClass, "w-20")}
                  />
                  <span className="text-xs text-white/40">px</span>
                </div>
              </Field>
            </Section>

            {/* Live font preview */}
            <div className="rounded-lg border border-white/10 p-3 bg-black/20">
              <p className="text-[10px] text-white/30 mb-2 uppercase tracking-wider">Aperçu</p>
              <p style={{ fontFamily: fonts.heading, fontSize: "18px", color: "white" }} className="font-semibold">
                Titre en {fonts.heading}
              </p>
              <p style={{ fontFamily: fonts.body, fontSize: fonts.baseSize ?? "14px", color: "rgba(255,255,255,0.5)" }} className="mt-1">
                Corps du texte en {fonts.body}
              </p>
            </div>
          </>
        )}

        {/* ── Composants ── */}
        {tab === "components" && (
          <>
            <Section title="Boutons">
              <Field label="Rayon (border-radius)">
                <SliderField
                  value={parseInt(buttons.borderRadius ?? "8")}
                  min={0} max={24}
                  onChange={(v) => setButtons("borderRadius", `${v}px`)}
                  suffix="px"
                />
              </Field>
              <Field label="Padding">
                <Input
                  value={buttons.padding ?? "12px 24px"}
                  onChange={(e) => setButtons("padding", e.target.value)}
                  placeholder="12px 24px"
                  className={inputClass}
                />
              </Field>
              <Field label="Style">
                <div className="grid grid-cols-2 gap-1">
                  {(["filled", "outline"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={cn(
                        "text-xs px-2 py-1.5 rounded border transition-colors",
                        (buttons.style ?? "filled") === s
                          ? "border-blue-500 bg-blue-600/20 text-blue-300"
                          : "border-white/10 text-white/40 hover:border-white/30"
                      )}
                      onClick={() => setButtons("style", s)}
                    >
                      {s === "filled" ? "Plein" : "Contour"}
                    </button>
                  ))}
                </div>
              </Field>

              {/* Button preview */}
              <div
                className="mt-2 text-center"
                style={{
                  borderRadius: buttons.borderRadius ?? "8px",
                  padding: buttons.padding ?? "12px 24px",
                  background: buttons.style === "outline" ? "transparent" : colors.primary,
                  border: buttons.style === "outline" ? `2px solid ${colors.primary}` : "none",
                  color: buttons.style === "outline" ? colors.primary : "#fff",
                  display: "inline-block",
                  fontSize: "13px",
                  fontWeight: 500,
                }}
              >
                Exemple bouton
              </div>
            </Section>

            <Section title="Cartes">
              <Field label="Rayon (border-radius)">
                <SliderField
                  value={parseInt(cards.borderRadius ?? "8")}
                  min={0} max={24}
                  onChange={(v) => setCards("borderRadius", `${v}px`)}
                  suffix="px"
                />
              </Field>
              <Field label="Ombre">
                <select
                  value={cards.shadow ?? "md"}
                  onChange={(e) => setCards("shadow", e.target.value)}
                  className="w-full h-8 text-xs bg-black/30 border border-white/10 rounded text-white/80 px-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {SHADOW_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Padding interne">
                <Input
                  value={cards.padding ?? "24px"}
                  onChange={(e) => setCards("padding", e.target.value)}
                  placeholder="24px"
                  className={inputClass}
                />
              </Field>
            </Section>
          </>
        )}

        {/* ── Espacements ── */}
        {tab === "spacing" && (
          <Section title="Espacements globaux">
            <Field label={`Padding sections : ${spacing.sectionPadding ?? "80px"}`}>
              <SliderField
                value={parseInt(spacing.sectionPadding ?? "80")}
                min={20} max={160}
                onChange={(v) => setSpacing("sectionPadding", `${v}px`)}
                suffix="px"
              />
            </Field>
            <Field label={`Écart entre éléments : ${spacing.elementGap ?? "24px"}`}>
              <SliderField
                value={parseInt(spacing.elementGap ?? "24")}
                min={8} max={64}
                onChange={(v) => setSpacing("elementGap", `${v}px`)}
                suffix="px"
              />
            </Field>
            <div className="rounded-lg border border-white/10 p-3 bg-black/20 mt-3">
              <p className="text-[10px] text-white/30 mb-2 uppercase tracking-wider">Aperçu espacement section</p>
              <div
                className="w-full rounded bg-white/5 flex items-center justify-center text-white/30 text-xs"
                style={{ padding: spacing.sectionPadding ?? "80px", paddingLeft: "16px", paddingRight: "16px" }}
              >
                Contenu de section
              </div>
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

const inputClass = "h-8 text-xs bg-black/30 border-white/10 text-white placeholder:text-white/20 focus-visible:ring-blue-500";

const COLOR_LABELS: Record<string, string> = {
  primary: "Principale",
  secondary: "Secondaire",
  accent: "Accentuation",
  background: "Fond",
  text: "Texte",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="text-[10px] text-white/40 uppercase tracking-wider">{title}</p>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-white/50">{label}</Label>
      {children}
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-white/60">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-xs text-white/30 font-mono">{value}</span>
        <label className="relative cursor-pointer">
          <div
            className="h-7 w-10 rounded border border-white/20 cursor-pointer"
            style={{ background: value }}
          />
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          />
        </label>
      </div>
    </div>
  );
}

function FontSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-8 text-xs bg-black/30 border border-white/10 rounded text-white/80 px-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
    >
      {GOOGLE_FONTS.map((f) => (
        <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
      ))}
    </select>
  );
}

function SliderField({ value, min, max, onChange, suffix }: {
  value: number; min: number; max: number;
  onChange: (v: number) => void; suffix?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 h-1 accent-blue-500 cursor-pointer"
      />
      <span className="text-xs text-white/50 w-14 text-right">{value}{suffix}</span>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      className={cn("w-10 h-5 rounded-full transition-colors relative", value ? "bg-blue-600" : "bg-white/15")}
      onClick={() => onChange(!value)}
    >
      <span className={cn("absolute top-0.5 h-4 w-4 bg-white rounded-full shadow transition-transform", value ? "translate-x-5 left-0.5" : "left-0.5")} />
    </button>
  );
}
