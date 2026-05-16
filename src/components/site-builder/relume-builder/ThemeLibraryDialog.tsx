"use client";

import React from "react";
import { X, Layers, Check, Loader2, Palette, FileText, AlertCircle } from "lucide-react";
import type { SerializedThemeConfig } from "@/lib/site-builder/theme-serializer";
import { countThemeSections } from "@/lib/site-builder/theme-serializer";
import { Btn, ModalBody, ModalFt, ModalHd, ModalShell, Pill } from "./skin-primitives";

interface SiteTheme {
  id: string;
  name: string;
  description: string | null;
  preview_image_url: string | null;
  config: SerializedThemeConfig;
  is_builtin: boolean;
  enterprise_id: number | null;
  created_at: string;
}

interface ThemeLibraryDialogProps {
  open: boolean;
  onClose: () => void;
  onApply: (config: SerializedThemeConfig) => void;
  enterpriseId?: number;
}

export function ThemeLibraryDialog({ open, onClose, onApply, enterpriseId }: ThemeLibraryDialogProps) {
  const [themes, setThemes] = React.useState<SiteTheme[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [applying, setApplying] = React.useState<string | null>(null);
  const [confirmId, setConfirmId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    const url = enterpriseId
      ? `/api/site-builder/themes?enterprise=${enterpriseId}`
      : "/api/site-builder/themes";
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setThemes(data);
        else setError("Erreur de chargement");
      })
      .catch(() => setError("Erreur réseau"))
      .finally(() => setLoading(false));
  }, [open, enterpriseId]);

  const handleApply = async (theme: SiteTheme) => {
    setApplying(theme.id);
    try {
      onApply(theme.config);
      onClose();
    } finally {
      setApplying(null);
      setConfirmId(null);
    }
  };

  return (
    <ModalShell open={open} onClose={onClose} size="xl" className="sb-skin">
      <ModalHd
        icon={<Palette size={14} />}
        title="Bibliothèque de thèmes"
        subtitle="Appliquer un thème remplace le style et les sections actuels"
        right={<Btn variant="ghost" size="sm" icon onClick={onClose}><X size={13} /></Btn>}
      />
      <ModalBody>
        {loading && (
          <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
            <Loader2 size={20} className="animate-spin" style={{ color: "var(--text-3)" }} />
          </div>
        )}

        {error && (
          <div className="alert-soft warn" style={{ marginBottom: 12 }}>
            <AlertCircle size={13} />
            <span>{error}</span>
          </div>
        )}

        {!loading && !error && themes.length === 0 && (
          <div style={{ textAlign: "center", padding: 60 }}>
            <Layers size={28} style={{ color: "var(--border-2)", margin: "0 auto 10px" }} />
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-2)", marginBottom: 4 }}>
              Aucun thème disponible
            </div>
            <div style={{ fontSize: 11, color: "var(--text-4)" }}>
              Enregistrez votre site actuel comme thème pour commencer.
            </div>
          </div>
        )}

        {!loading && themes.length > 0 && (
          <div className="card-grid cols2">
            {themes.map((theme) => {
              const sectionCount = theme.config?.instancesByPage ? countThemeSections(theme.config) : 0;
              const pageCount = theme.config?.sitemap?.length ?? 0;
              const isConfirming = confirmId === theme.id;
              const isApplying = applying === theme.id;

              return (
                <div key={theme.id} className="picker-card">
                  <div className="preview" style={{ height: 110 }}>
                    {theme.preview_image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={theme.preview_image_url} alt={theme.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <div style={{ textAlign: "center" }}>
                        <Layers size={22} style={{ color: "var(--text-4)" }} />
                        <div style={{ fontSize: 10, color: "var(--text-4)", marginTop: 3, fontFamily: "var(--font-mono)" }}>
                          {sectionCount} sections
                        </div>
                      </div>
                    )}
                    {theme.is_builtin && <span className="badge">Intégré</span>}
                    {theme.enterprise_id && !theme.is_builtin && <span className="badge magic">Votre thème</span>}
                  </div>

                  <div className="meta">
                    <div className="name">{theme.name}</div>
                    {theme.description && <div className="cat" style={{ fontFamily: "var(--font-ui)" }}>{theme.description}</div>}
                    <div className="stats">
                      <span><FileText size={9} />{pageCount} page{pageCount !== 1 ? "s" : ""}</span>
                      <span><Layers size={9} />{sectionCount} section{sectionCount !== 1 ? "s" : ""}</span>
                    </div>

                    {!isConfirming ? (
                      <button
                        onClick={() => setConfirmId(theme.id)}
                        className="btn primary"
                        style={{ width: "100%", justifyContent: "center", marginTop: 10 }}
                      >
                        Appliquer
                      </button>
                    ) : (
                      <div style={{ marginTop: 10 }}>
                        <div className="alert-soft warn" style={{ marginBottom: 6, fontSize: 10.5 }}>
                          <AlertCircle size={11} />
                          <span>Remplace le site actuel — confirmer ?</span>
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            onClick={() => handleApply(theme)}
                            disabled={isApplying}
                            className="btn accent"
                            style={{ flex: 1, justifyContent: "center" }}
                          >
                            {isApplying ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                            Confirmer
                          </button>
                          <button onClick={() => setConfirmId(null)} className="btn outline">
                            Annuler
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ModalBody>
      <ModalFt>
        {!loading && themes.length > 0 && <Pill>{themes.length} thèmes</Pill>}
        <span className="grow" />
        <Btn variant="outline" onClick={onClose}>Fermer</Btn>
      </ModalFt>
    </ModalShell>
  );
}
