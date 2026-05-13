"use client";

import React from "react";
import { Sparkles, X, Loader2, Check, AlertCircle } from "lucide-react";
import type { SiteSectionInstance, SiteSectionDef } from "@/types";
import { useRelumeBuilder, nanoid } from "./RelumeBuilderProvider";
import { ModelDropdown } from "./SitemapWorkspace";
import { useAIModel } from "@/hooks/useAIModel";
import { VariableTextarea } from "./VariableTextarea";

interface AIPanelProps {
  siteId: string;
  enterpriseId?: number;
  availableSections: SiteSectionDef[];
  onClose?: () => void;
}

type Step = "idle" | "generating" | "done" | "error";

export function AIPanel({ siteId, enterpriseId, availableSections, onClose }: AIPanelProps) {
  const { state, dispatch } = useRelumeBuilder();
  const [description, setDescription] = React.useState("");
  const [pagesInput, setPagesInput] = React.useState("Accueil, Services, À propos, Contact");
  const [step, setStep] = React.useState<Step>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useAIModel();

  const generate = async () => {
    setStep("generating");
    setError(null);
    setPreview(null);

    try {
      const res = await fetch("/api/site-builder/ai/generate-sitemap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId,
          enterpriseId,
          description,
          pages: pagesInput.split(",").map((p) => p.trim()).filter(Boolean),
          availableSectionIds: availableSections.map((s) => ({ id: s.id, type: s.type, name: s.name, category: s.category })),
          model: selectedModel,
          variableContext: state.variableContext,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Erreur inconnue");
      }

      const data = await res.json();
      setPreview(JSON.stringify(data, null, 2));

      // Apply the generated sitemap to state
      applyGenerated(data, availableSections);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
      setStep("error");
    }
  };

  const applyGenerated = (
    data: {
      styleGuide?: Record<string, unknown>;
      sitemap?: Array<{
        slug: string;
        title: string;
        metaTitle?: string;
        metaDescription?: string;
        sections?: Array<{
          section_id: string;
          content: Record<string, unknown>;
          blocks?: Array<{ id: string; type: string; settings: Record<string, unknown> }>;
        }>;
      }>;
    },
    sections: SiteSectionDef[]
  ) => {
    const sectionById = Object.fromEntries(sections.map((s) => [s.id, s]));

    // 1. Update style guide if provided
    if (data.styleGuide) {
        dispatch({ type: "UPDATE_STYLE_GUIDE", payload: data.styleGuide as any });
    }

    // 2. Build sitemap pages
    const sitemapPages = (data.sitemap ?? []).map((p, i) => ({
      id: `page-${i}-${nanoid()}`,
      slug: p.slug,
      title: p.title,
      metaTitle: p.metaTitle,
      metaDescription: p.metaDescription,
    }));

    // 3. Clear and rebuild: remove all existing pages first, then add new ones
    // (simplest approach: rebuild from scratch)
    for (const page of sitemapPages) {
      dispatch({ type: "ADD_PAGE", payload: page });
    }

    // 4. Create section instances for each page
    for (const page of data.sitemap ?? []) {
      for (let idx = 0; idx < (page.sections ?? []).length; idx++) {
        const sectionData = (page.sections ?? [])[idx];
        const sectionDef = sectionById[sectionData.section_id];
        if (!sectionDef) continue;

        const baseContent: Record<string, unknown> = { ...(sectionData.content ?? {}) };
        if (sectionDef.theme_slug && sectionDef.theme_section_id) {
          baseContent.__library = { theme_slug: sectionDef.theme_slug, section_id: sectionDef.theme_section_id };
        }
        const instance: SiteSectionInstance = {
          id: nanoid(),
          site_id: siteId,
          section_id: null,
          page_slug: page.slug,
          sort_order: idx,
          content: baseContent,
          blocks: Array.isArray(sectionData.blocks) ? sectionData.blocks : [],
          custom_style: {},
          is_hidden: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          section_def: sectionDef,
        };

        dispatch({
          type: "ADD_INSTANCE",
          payload: { instance, pageSlug: page.slug, index: idx },
        });
      }
    }

    // 5. Navigate to first page
    if (sitemapPages[0]) {
      dispatch({ type: "SET_ACTIVE_PAGE", payload: sitemapPages[0].slug });
    }
  };

  return (
    <div className="flex flex-col h-full text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-purple-400" />
          <span className="text-sm font-semibold">Assistant IA</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-white/40 hover:text-white/80 transition-colors">
            <X size={16} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Tab: Sitemap generation */}
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-white/40 uppercase tracking-wider block mb-2">
              Sitemap complet
            </label>
            <p className="text-xs text-white/30 mb-3">
              L'IA génère le plan du site, choisit les sections et rédige le contenu pour chaque page.
            </p>
          </div>

          <div>
            <label className="text-xs text-white/50 block mb-1">Modèle IA</label>
            <ModelDropdown value={selectedModel} onChange={setSelectedModel} />
          </div>

          <div>
            <label className="text-xs text-white/50 block mb-1">Description de l'entreprise</label>
            <VariableTextarea
              value={description}
              onChange={setDescription}
              placeholder="Ex: Plombier à Lyon spécialisé dans les interventions d'urgence, 15 ans d'expérience, équipe de 5 techniciens..."
              rows={4}
              className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-purple-500/50 resize-none"
              variables={state.variableContext}
              variant="dark"
            />
          </div>

          <div>
            <label className="text-xs text-white/50 block mb-1">Pages souhaitées</label>
            <input
              type="text"
              value={pagesInput}
              onChange={(e) => setPagesInput(e.target.value)}
              placeholder="Accueil, Services, À propos, Contact"
              className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-purple-500/50"
            />
            <p className="text-xs text-white/20 mt-1">Séparées par des virgules</p>
          </div>

          {!enterpriseId && (
            <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <AlertCircle size={14} className="text-amber-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-amber-400/80">
                Associez une entreprise à ce site pour pré-remplir les données automatiquement.
              </p>
            </div>
          )}

          <button
            onClick={generate}
            disabled={step === "generating" || !description.trim()}
            className="w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {step === "generating" ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Génération en cours...
              </>
            ) : (
              <>
                <Sparkles size={16} />
                Générer le site
              </>
            )}
          </button>

          {step === "done" && (
            <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
              <Check size={14} className="text-green-400" />
              <p className="text-xs text-green-400">Site généré avec succès ! Retrouvez le contenu dans le canvas.</p>
            </div>
          )}

          {step === "error" && error && (
            <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <AlertCircle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}
        </div>

        {/* Tips */}
        <div className="border-t border-white/10 pt-4 space-y-2">
          <p className="text-xs font-semibold text-white/30 uppercase tracking-wider">Conseils</p>
          {[
            "Décrivez votre secteur, localisation et spécialités",
            "Mentionnez vos points forts et différenciateurs",
            "Précisez le ton souhaité (professionnel, décontracté...)",
          ].map((tip, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-white/20 text-xs mt-0.5">•</span>
              <p className="text-xs text-white/30">{tip}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
