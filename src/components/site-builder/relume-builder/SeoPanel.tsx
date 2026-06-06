"use client";

import React from "react";
import type { SitemapPage } from "@/types";
import { useRelumeBuilder } from "./RelumeBuilderProvider";
import { VariableTextarea } from "./VariableTextarea";
import { ImagePickerField } from "@/components/site-builder/editors/ImagePickerField";
import { interpolateVars } from "@/lib/site-builder/interpolate-vars";

type SeoFieldKey = "metaTitle" | "metaDescription" | "ogTitle" | "ogDescription" | "ogImage";

const RECO: Record<SeoFieldKey, { min: number; max: number } | null> = {
  metaTitle: { min: 50, max: 60 },
  metaDescription: { min: 150, max: 160 },
  ogTitle: { min: 0, max: 60 },
  ogDescription: { min: 0, max: 110 },
  ogImage: null,
};

/** Char counter, coloured by recommended range. Counts the INTERPOLATED length
 *  (what visitors actually see) so {{ variables }} are reflected. */
function CharCounter({ raw, variables, min, max }: { raw: string; variables: Record<string, string>; min: number; max: number }) {
  const len = interpolateVars(raw, variables).length;
  let color = "var(--text-4)";
  if (len === 0) color = "var(--text-4)";
  else if (max && len > max) color = "var(--danger, #b91c1c)";
  else if (min && len < min) color = "var(--warn, #b45309)";
  else color = "var(--success, #15803d)";
  const reco = max ? ` · idéal ${min ? `${min}–${max}` : `≤ ${max}`}` : "";
  return <span style={{ fontSize: 9, color }}>{len} car.{reco}</span>;
}

function SeoTextField({
  label, fieldKey, value, placeholder, onChange, variables, rows,
}: {
  label: string;
  fieldKey: SeoFieldKey;
  value: string;
  placeholder?: string;
  onChange: (key: SeoFieldKey, value: string) => void;
  variables: Record<string, string>;
  rows?: number;
}) {
  const reco = RECO[fieldKey];
  return (
    <div className="field" style={{ marginBottom: 10 }}>
      <div className="field-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>{label}</span>
        {reco && <CharCounter raw={value} variables={variables} min={reco.min} max={reco.max} />}
      </div>
      <VariableTextarea
        value={value}
        onChange={(v) => onChange(fieldKey, v)}
        rows={rows ?? 2}
        variables={variables}
        variant="light"
        placeholder={placeholder || "…"}
      />
    </div>
  );
}

/** Shared field set. Used for site-level defaults and per-page overrides. */
function SeoFields({
  values, onChange, variables, siteId, placeholders,
}: {
  values: Partial<Record<SeoFieldKey, string>>;
  onChange: (key: SeoFieldKey, value: string) => void;
  variables: Record<string, string>;
  siteId: string;
  /** Site-level values shown as placeholders on per-page fields. */
  placeholders?: Partial<Record<SeoFieldKey, string>>;
}) {
  return (
    <div>
      <SeoTextField label="Titre (meta title)" fieldKey="metaTitle" value={values.metaTitle ?? ""} placeholder={placeholders?.metaTitle} onChange={onChange} variables={variables} rows={2} />
      <SeoTextField label="Description (meta description)" fieldKey="metaDescription" value={values.metaDescription ?? ""} placeholder={placeholders?.metaDescription} onChange={onChange} variables={variables} rows={3} />
      <div style={{ borderTop: "1px dashed var(--border-2, #e5e2da)", margin: "10px 0 8px" }} />
      <SeoTextField label="Titre social (og:title)" fieldKey="ogTitle" value={values.ogTitle ?? ""} placeholder={placeholders?.ogTitle} onChange={onChange} variables={variables} rows={2} />
      <SeoTextField label="Description sociale (og:description)" fieldKey="ogDescription" value={values.ogDescription ?? ""} placeholder={placeholders?.ogDescription} onChange={onChange} variables={variables} rows={3} />
      <div className="field">
        <div className="field-label"><span>Image de partage (og:image)</span><span className="hint">1200×630</span></div>
        <ImagePickerField
          setting={{ type: "image_picker", id: "ogImage", label: "Image de partage" }}
          value={values.ogImage ?? ""}
          onChange={(url) => onChange("ogImage", url)}
          siteId={siteId}
        />
      </div>
    </div>
  );
}

/** Site-level SEO defaults editor (writes state.seo via UPDATE_SEO). */
export function SiteSeoSection() {
  const { state, dispatch } = useRelumeBuilder();
  const seo = state.seo ?? {};
  const onChange = (key: SeoFieldKey, value: string) =>
    dispatch({ type: "UPDATE_SEO", payload: { [key]: value || undefined } });
  return (
    <div>
      <p style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.45, marginBottom: 8 }}>
        Valeurs par défaut du site. Chaque page peut les surcharger. Les
        variables comme <code style={{ fontSize: 10 }}>{`{{ entreprise.nom }}`}</code> sont remplacées
        automatiquement.
      </p>
      <SeoFields values={seo} onChange={onChange} variables={state.variableContext} siteId={state.siteId} />
    </div>
  );
}

/** Per-page SEO override editor (writes the page via UPDATE_PAGE). Site-level
 *  defaults are shown as placeholders to make the cascade obvious. */
export function PageSeoFields({ page }: { page: SitemapPage }) {
  const { state, dispatch } = useRelumeBuilder();
  const onChange = (key: SeoFieldKey, value: string) =>
    dispatch({ type: "UPDATE_PAGE", payload: { id: page.id, data: { [key]: value || undefined } } });
  const values: Partial<Record<SeoFieldKey, string>> = {
    metaTitle: page.metaTitle,
    metaDescription: page.metaDescription,
    ogTitle: page.ogTitle,
    ogDescription: page.ogDescription,
    ogImage: page.ogImage,
  };
  const placeholders: Partial<Record<SeoFieldKey, string>> = {
    metaTitle: state.seo?.metaTitle,
    metaDescription: state.seo?.metaDescription,
    ogTitle: state.seo?.ogTitle,
    ogDescription: state.seo?.ogDescription,
  };
  return <SeoFields values={values} onChange={onChange} variables={state.variableContext} siteId={state.siteId} placeholders={placeholders} />;
}
