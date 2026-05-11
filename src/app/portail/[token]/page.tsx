"use client";

import React from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";

interface EditableSection {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

interface PortalData {
  siteId: string;
  siteName: string;
  subdomain: string;
  editableSections: EditableSection[];
}

const SECTION_TYPE_LABELS: Record<string, string> = {
  hero: "Bannière principale",
  services: "Nos Services",
  about: "À propos",
  testimonials: "Avis clients",
  contact: "Contact",
  faq: "FAQ",
  gallery: "Galerie",
  blog: "Blog",
  popup: "Popup",
  "cta-banner": "Bannière CTA",
};

export default function PortailPage() {
  const { token } = useParams<{ token: string }>();
  const [portalData, setPortalData] = React.useState<PortalData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [editingSection, setEditingSection] = React.useState<EditableSection | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!token) return;
    fetch("/api/public/portal/site", {
      headers: { "x-portal-token": token },
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? "Erreur");
        }
        return res.json();
      })
      .then((data) => {
        setPortalData(data);
      })
      .catch((err) => {
        setError(err.message ?? "Impossible de charger votre site");
      })
      .finally(() => setLoading(false));
  }, [token]);

  const handleSave = async (sectionId: string, data: Record<string, unknown>) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/public/portal/site/sections/${sectionId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-portal-token": token,
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Erreur lors de la sauvegarde");
      toast.success("Modifications sauvegardées !");
      setEditingSection(null);
      // Refresh data
      const refreshed = await fetch("/api/public/portal/site", {
        headers: { "x-portal-token": token },
      }).then((r) => r.json());
      setPortalData(refreshed);
    } catch {
      toast.error("Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Chargement de votre portail...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md text-center">
          <div className="text-4xl mb-4">🔒</div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">Accès refusé</h1>
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  if (!portalData) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{portalData.siteName}</h1>
            <p className="text-sm text-gray-500">Portail de gestion de votre site</p>
          </div>
          {portalData.subdomain && (
            <a
              href={`https://${portalData.subdomain}.samadigitalstudio.fr`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline"
            >
              Voir mon site →
            </a>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {editingSection ? (
          <SectionEditor
            section={editingSection}
            onSave={handleSave}
            onCancel={() => setEditingSection(null)}
            saving={saving}
          />
        ) : (
          <>
            <h2 className="text-lg font-semibold text-gray-800 mb-6">
              Sections modifiables ({portalData.editableSections.length})
            </h2>
            {portalData.editableSections.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-gray-500">
                Aucune section modifiable disponible pour votre site.
              </div>
            ) : (
              <div className="space-y-4">
                {portalData.editableSections.map((section) => (
                  <div
                    key={section.id}
                    className="bg-white rounded-xl border border-gray-200 p-5 flex items-center justify-between hover:shadow-sm transition-shadow"
                  >
                    <div>
                      <h3 className="font-medium text-gray-800">
                        {SECTION_TYPE_LABELS[section.type] ?? section.type}
                      </h3>
                      <p className="text-sm text-gray-500 mt-0.5">Section modifiable</p>
                    </div>
                    <button
                      type="button"
                      className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                      onClick={() => setEditingSection(section)}
                    >
                      Modifier
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

// ─── Simple section editor ───────────────────────────────────────────────────

interface SectionEditorProps {
  section: EditableSection;
  onSave: (id: string, data: Record<string, unknown>) => void;
  onCancel: () => void;
  saving: boolean;
}

function SectionEditor({ section, onSave, onCancel, saving }: SectionEditorProps) {
  const [values, setValues] = React.useState<Record<string, unknown>>({ ...section.data });

  const setField = (key: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  // Render a simple form for string/boolean top-level fields
  const fields = Object.entries(section.data).filter(
    ([, v]) => typeof v === "string" || typeof v === "boolean"
  );

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      <div className="flex items-center gap-4 mb-6">
        <button
          type="button"
          onClick={onCancel}
          className="text-gray-500 hover:text-gray-700 text-sm"
        >
          ← Retour
        </button>
        <h2 className="text-lg font-semibold text-gray-900">
          Modifier — {SECTION_TYPE_LABELS[section.type] ?? section.type}
        </h2>
      </div>

      <div className="space-y-4">
        {fields.map(([key, value]) => (
          <div key={key}>
            <label className="block text-sm font-medium text-gray-700 mb-1 capitalize">
              {key.replace(/_/g, " ")}
            </label>
            {typeof value === "boolean" ? (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={values[key] as boolean}
                  onChange={(e) => setField(key, e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600"
                />
                <span className="text-sm text-gray-600">Activé</span>
              </label>
            ) : (
              <textarea
                value={values[key] as string}
                onChange={(e) => setField(key, e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                rows={String(value).length > 100 ? 4 : 2}
              />
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-3 mt-6 pt-5 border-t border-gray-100">
        <button
          type="button"
          onClick={() => onSave(section.id, values)}
          disabled={saving}
          className="px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
        >
          {saving ? "Sauvegarde…" : "Sauvegarder"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-6 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}
