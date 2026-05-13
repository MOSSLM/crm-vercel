"use client";

import React from "react";
import { X, Layers, Check, Loader2, Palette, FileText, AlertCircle } from "lucide-react";
import type { SerializedThemeConfig } from "@/lib/site-builder/theme-serializer";
import { countThemeSections } from "@/lib/site-builder/theme-serializer";

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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-3xl max-h-[85vh] bg-white rounded-2xl shadow-2xl flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <Palette size={16} className="text-blue-500" />
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Bibliothèque de thèmes</h2>
              <p className="text-xs text-gray-400 mt-0.5">Appliquer un thème remplace le style et les sections actuels</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={20} className="text-gray-400 animate-spin" />
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          {!loading && !error && themes.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Layers size={32} className="text-gray-200 mb-3" />
              <p className="text-sm font-medium text-gray-500 mb-1">Aucun thème disponible</p>
              <p className="text-xs text-gray-400">Enregistrez votre site actuel comme thème pour commencer.</p>
            </div>
          )}

          {!loading && themes.length > 0 && (
            <div className="grid grid-cols-2 gap-4">
              {themes.map((theme) => {
                const sectionCount = theme.config?.instancesByPage
                  ? countThemeSections(theme.config)
                  : 0;
                const pageCount = theme.config?.sitemap?.length ?? 0;
                const isConfirming = confirmId === theme.id;
                const isApplying = applying === theme.id;

                return (
                  <div
                    key={theme.id}
                    className="border border-gray-200 rounded-xl overflow-hidden hover:border-blue-300 hover:shadow-md transition-all group"
                  >
                    {/* Preview area */}
                    <div className="h-32 bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center relative">
                      {theme.preview_image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={theme.preview_image_url}
                          alt={theme.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="text-center">
                          <Layers size={24} className="text-gray-300 mx-auto mb-1" />
                          <span className="text-[10px] text-gray-400">{sectionCount} sections</span>
                        </div>
                      )}
                      {theme.is_builtin && (
                        <span className="absolute top-2 left-2 px-1.5 py-0.5 text-[9px] font-semibold bg-blue-500 text-white rounded-md">
                          Intégré
                        </span>
                      )}
                      {theme.enterprise_id && !theme.is_builtin && (
                        <span className="absolute top-2 left-2 px-1.5 py-0.5 text-[9px] font-semibold bg-purple-500 text-white rounded-md">
                          Votre thème
                        </span>
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-3">
                      <h3 className="text-xs font-semibold text-gray-800 truncate">{theme.name}</h3>
                      {theme.description && (
                        <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-2">{theme.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2">
                        <span className="flex items-center gap-1 text-[10px] text-gray-400">
                          <FileText size={9} />
                          {pageCount} page{pageCount !== 1 ? "s" : ""}
                        </span>
                        <span className="flex items-center gap-1 text-[10px] text-gray-400">
                          <Layers size={9} />
                          {sectionCount} section{sectionCount !== 1 ? "s" : ""}
                        </span>
                      </div>

                      {/* Apply button */}
                      {!isConfirming ? (
                        <button
                          onClick={() => setConfirmId(theme.id)}
                          className="mt-2.5 w-full py-1.5 text-xs font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors"
                        >
                          Appliquer
                        </button>
                      ) : (
                        <div className="mt-2.5 space-y-1.5">
                          <p className="text-[10px] text-amber-600 text-center">
                            Remplace le site actuel — confirmer ?
                          </p>
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => handleApply(theme)}
                              disabled={isApplying}
                              className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                            >
                              {isApplying ? (
                                <Loader2 size={11} className="animate-spin" />
                              ) : (
                                <Check size={11} />
                              )}
                              Confirmer
                            </button>
                            <button
                              onClick={() => setConfirmId(null)}
                              className="px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                            >
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
        </div>
      </div>
    </div>
  );
}
