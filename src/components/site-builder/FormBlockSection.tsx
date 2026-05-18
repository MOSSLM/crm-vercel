"use client";

import React, { useEffect, useState } from "react";
// The form runtime uses pv-* classes defined in forms-theme.css. This CSS
// is only auto-loaded on /forms/* and /f/[slug] routes, so when the form is
// embedded inside a site (site builder preview, library section overlay,
// or the published site) we need to pull it in explicitly — otherwise the
// form renders as unstyled text.
import "@/components/form-builder/forms-theme.css";

/**
 * Lazily loaded form block — avoids bundling FormRuntime into every page.
 * Used both by DynamicSectionRenderer (native form_block sections) and by
 * library sections that declare a `<div data-form-slot />` marker (mounted
 * via portal/overlay by LibrarySectionHydrator / DynamicSectionRenderer).
 */
export function FormBlockSection({
  formId,
  renderMode,
  siteId,
  editorMode,
  selected,
  onSelect,
  instanceId,
  variables,
  height,
}: {
  formId: string;
  renderMode: "step" | "scroll";
  siteId?: string;
  editorMode?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  instanceId?: string;
  variables?: Record<string, string>;
  /** Explicit height in px. When set, the container gets an explicit height so
   *  FormRuntime's flex layout (progress bar → body flex:1 → footer) works. */
  height?: number;
}) {
  const [form, setForm] = useState<import("@/types").Form | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`/api/forms/public/${formId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setForm)
      .catch(() => setError(true));
  }, [formId]);

  const FormRuntime = React.lazy(() =>
    import("@/components/form-builder/runtime/FormRuntime").then((m) => ({ default: m.FormRuntime })),
  );

  if (error) {
    if (!editorMode) return null;
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#8A877F", fontSize: 14 }}>
        Formulaire introuvable ou non publié.
      </div>
    );
  }

  if (!form) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#8A877F", fontSize: 14 }}>
        Chargement du formulaire…
      </div>
    );
  }

  return (
    <div
      onClick={editorMode ? (e) => { e.stopPropagation(); onSelect?.(); } : undefined}
      data-section-id={instanceId}
      className={editorMode ? "group/section" : ""}
      style={{
        position: "relative",
        ...(height ? { height: `${height}px` } : {}),
        border: selected ? "2px solid #3b82f6" : "2px solid transparent",
      }}
    >
      <React.Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "#8A877F" }}>Chargement…</div>}>
        <FormRuntime
          form={form}
          mode={renderMode}
          siteId={siteId}
          embedded={editorMode}
          variables={variables}
        />
      </React.Suspense>
    </div>
  );
}
