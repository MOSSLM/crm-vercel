"use client";

import React from "react";
import { Save, Globe, Check, Share2, Upload, Users, History, X, RotateCcw } from "lucide-react";
import { format } from "date-fns";
import type { SiteVersion } from "@/types";
import { toast } from "sonner";
import type { SiteSectionDef, SiteSectionInstance, StyleGuide, SitemapPage, WorkspaceId } from "@/types";
import { DEFAULT_STYLE_GUIDE } from "@/types";
import { RelumeBuilderProvider, useRelumeBuilder, nanoid } from "./RelumeBuilderProvider";
import { SitemapWorkspace } from "./SitemapWorkspace";
import { WireframeWorkspace } from "./WireframeWorkspace";
import { StyleGuideWorkspace } from "./StyleGuideWorkspace";
import { DesignWorkspace } from "./DesignWorkspace";

// ─── Public API ───────────────────────────────────────────────────────────────

export interface RelumeEditorProps {
  siteId: string;
  siteName: string;
  enterpriseId?: number;
  isPublished?: boolean;
  publishedSubdomain?: string;
  initialSections?: SiteSectionDef[];
  initialInstances?: SiteSectionInstance[];
  initialStyleGuide?: StyleGuide | null;
  initialSitemap?: SitemapPage[];
}

export function RelumeEditor(props: RelumeEditorProps) {
  return (
    <RelumeBuilderProvider siteId={props.siteId} siteName={props.siteName}>
      <RelumeEditorInner {...props} />
    </RelumeBuilderProvider>
  );
}

// ─── Inner Editor ─────────────────────────────────────────────────────────────

function RelumeEditorInner({
  siteId,
  siteName,
  enterpriseId,
  isPublished,
  publishedSubdomain,
  initialSections = [],
  initialInstances = [],
  initialStyleGuide,
  initialSitemap,
}: RelumeEditorProps) {
  const { state, dispatch } = useRelumeBuilder();
  const [saving, setSaving] = React.useState(false);
  const [publishing, setPublishing] = React.useState(false);
  const [publishDomain, setPublishDomain] = React.useState(publishedSubdomain ?? "");
  const [showPublish, setShowPublish] = React.useState(false);
  const [showHistory, setShowHistory] = React.useState(false);
  const [versions, setVersions] = React.useState<SiteVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = React.useState(false);
  const [restoring, setRestoring] = React.useState<string | null>(null);

  const sectionDefs = React.useMemo(
    () => Object.fromEntries(initialSections.map((s) => [s.id, s])),
    [initialSections]
  );

  React.useEffect(() => {
    dispatch({
      type: "LOAD",
      payload: {
        styleGuide: initialStyleGuide ?? DEFAULT_STYLE_GUIDE,
        sitemap: initialSitemap ?? [{ id: "page-home", slug: "/", title: "Accueil" }],
        instances: initialInstances.map((inst) => ({
          ...inst,
          section_def: inst.section_id ? sectionDefs[inst.section_id] : undefined,
        })),
      },
    });
  }, [siteId]);

  // ─── Save ────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    try {
      const instances = Object.values(state.instances);
      await fetch(`/api/site-builder/sites/${siteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ style_guide: state.styleGuide, sitemap: state.sitemap }),
      });
      await fetch(`/api/site-builder/sites/${siteId}/instances`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instances }),
      });
      // Save version snapshot
      await fetch(`/api/site-builder/sites/${siteId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          snapshot: { style_guide: state.styleGuide, sitemap: state.sitemap, instances },
        }),
      });
      dispatch({ type: "MARK_SAVED" });
      toast.success("Sauvegardé");
    } catch {
      toast.error("Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  const handleOpenHistory = async () => {
    setShowHistory(true);
    setLoadingVersions(true);
    try {
      const res = await fetch(`/api/site-builder/sites/${siteId}/versions`);
      setVersions(await res.json());
    } catch {
      toast.error("Erreur lors du chargement des versions");
    } finally {
      setLoadingVersions(false);
    }
  };

  const handleRestore = async (versionId: string) => {
    if (!window.confirm("Restaurer cette version ? L'état actuel sera remplacé.")) return;
    setRestoring(versionId);
    try {
      const res = await fetch(`/api/site-builder/sites/${siteId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version_id: versionId }),
      });
      if (!res.ok) throw new Error();
      toast.success("Version restaurée — rechargement…");
      setShowHistory(false);
      setTimeout(() => window.location.reload(), 800);
    } catch {
      toast.error("Erreur lors de la restauration");
    } finally {
      setRestoring(null);
    }
  };

  // ─── Publish ─────────────────────────────────────────────────────────────────

  const handlePublish = async () => {
    if (!publishDomain.trim()) return;
    setPublishing(true);
    try {
      const res = await fetch(`/api/site-builder/sites/${siteId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subdomain: publishDomain.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Erreur");
      }
      setShowPublish(false);
      toast.success(`Site publié sur ${publishDomain}.${process.env.NEXT_PUBLIC_SITE_DOMAIN ?? "monsupercrm.fr"}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur de publication");
    } finally {
      setPublishing(false);
    }
  };

  // ─── AI Regenerate Section ────────────────────────────────────────────────────

  const handleRegenerateSection = async (instanceId: string, prompt: string, model = "claude-sonnet-4-6") => {
    const instance = state.instances[instanceId];
    const sectionDef = instance?.section_def ?? (instance?.section_id ? sectionDefs[instance.section_id] : null);
    if (!instance || !sectionDef) return;
    try {
      const res = await fetch("/api/site-builder/ai/regenerate-section", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId,
          instanceId,
          sectionType: sectionDef.type,
          currentContent: instance.content,
          defaultContent: sectionDef.default_content,
          prompt,
          model,
        }),
      });
      if (!res.ok) throw new Error("Erreur IA");
      const { content } = await res.json();
      dispatch({ type: "UPDATE_INSTANCE_CONTENT", payload: { id: instanceId, content } });
      toast.success("Contenu régénéré");
    } catch {
      toast.error("Erreur lors de la régénération");
    }
  };

  const WORKSPACES: { id: WorkspaceId; label: string }[] = [
    { id: "sitemap", label: "Sitemap" },
    { id: "wireframe", label: "Wireframe" },
    { id: "style-guide", label: "Style Guide" },
    { id: "design", label: "Design" },
  ];

  return (
    <div className="flex flex-col h-screen bg-white text-gray-900 overflow-hidden">

      {/* ─ Top Bar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center h-12 px-4 border-b border-gray-200 bg-white flex-shrink-0 z-40 select-none">

        {/* Logo + Site name */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex-shrink-0 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-white/80" />
          </div>
          <span className="text-sm font-medium text-gray-800 truncate max-w-[160px]">{siteName}</span>
        </div>

        {/* Invite & earn */}
        <button className="ml-3 flex items-center gap-1.5 px-3 py-1 text-xs text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors flex-shrink-0">
          <Users size={12} />
          Invite &amp; earn
        </button>

        {/* Center workspace tabs */}
        <div className="flex items-center gap-0.5 mx-auto">
          {WORKSPACES.map((ws) => (
            <button
              key={ws.id}
              onClick={() => dispatch({ type: "SET_WORKSPACE", payload: ws.id })}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                state.activeWorkspace === ws.id
                  ? "bg-gray-900 text-white"
                  : "text-gray-500 hover:text-gray-800 hover:bg-gray-100"
              }`}
            >
              {ws.label}
            </button>
          ))}
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2 ml-auto flex-shrink-0">
          {/* Dirty indicator */}
          {state.isDirty && (
            <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
              Non sauvegardé
            </span>
          )}

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={saving || !state.isDirty}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-40"
          >
            {saving ? (
              <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
            ) : state.isDirty ? (
              <Save size={12} />
            ) : (
              <Check size={12} className="text-green-600" />
            )}
            {saving ? "Sauvegarde..." : "Enregistrer"}
          </button>

          {/* Historique */}
          <button
            onClick={handleOpenHistory}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
          >
            <History size={12} />
            Historique
          </button>

          {/* Share */}
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors">
            <Share2 size={12} />
            Share
          </button>

          {/* Export */}
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors">
            <Upload size={12} />
            Export
          </button>

          {/* Publish / Upgrade */}
          <div className="relative">
            <button
              onClick={() => setShowPublish(!showPublish)}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-gray-900 text-white rounded-md hover:bg-gray-700 transition-colors"
            >
              <Globe size={12} />
              {isPublished ? "Republier" : "Publier"}
            </button>
            {showPublish && (
              <div className="absolute top-full right-0 mt-2 w-72 bg-white border border-gray-200 rounded-xl shadow-xl p-4 z-50">
                <div className="text-sm font-semibold mb-3 text-gray-900">Publier le site</div>
                <div className="flex items-center gap-1 mb-3">
                  <input
                    type="text"
                    value={publishDomain}
                    onChange={(e) => setPublishDomain(e.target.value.replace(/[^a-z0-9-]/g, ""))}
                    placeholder="mon-site"
                    className="flex-1 bg-gray-50 border border-gray-200 rounded px-3 py-2 text-xs text-gray-900 font-mono focus:outline-none focus:border-blue-500"
                  />
                  <span className="text-xs text-gray-400">.{process.env.NEXT_PUBLIC_SITE_DOMAIN ?? "site.fr"}</span>
                </div>
                <button
                  onClick={handlePublish}
                  disabled={publishing || !publishDomain.trim()}
                  className="w-full py-2 text-xs font-semibold bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
                >
                  {publishing ? "Publication..." : "Publier"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─ Workspace ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {state.activeWorkspace === "sitemap" && (
          <SitemapWorkspace
            siteId={siteId}
            enterpriseId={enterpriseId}
            availableSections={initialSections}
          />
        )}
        {state.activeWorkspace === "wireframe" && (
          <WireframeWorkspace
            sectionDefs={sectionDefs}
            availableSections={initialSections}
            onRegenerateSection={handleRegenerateSection}
          />
        )}
        {state.activeWorkspace === "style-guide" && (
          <StyleGuideWorkspace />
        )}
        {state.activeWorkspace === "design" && (
          <DesignWorkspace
            sectionDefs={sectionDefs}
            onRegenerateSection={handleRegenerateSection}
          />
        )}
      </div>
      {/* ─ History Modal ──────────────────────────────────────────────────────── */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowHistory(false)}>
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <History size={16} className="text-gray-500" />
                <span className="text-sm font-semibold text-gray-900">Historique des versions</span>
              </div>
              <button onClick={() => setShowHistory(false)} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="overflow-y-auto max-h-96">
              {loadingVersions ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                </div>
              ) : versions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <History size={32} className="text-gray-200 mb-3" />
                  <p className="text-sm text-gray-400">Aucune version sauvegardée</p>
                  <p className="text-xs text-gray-300 mt-1">Sauvegardez le site pour créer une version</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {versions.map((v, i) => (
                    <div key={v.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                        <span className="text-xs font-mono text-gray-500">v{v.version_number}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 truncate">
                          {v.change_description ?? (i === 0 ? "Version actuelle" : `Version ${v.version_number}`)}
                        </p>
                        <p className="text-xs text-gray-400">
                          {format(new Date(v.created_at), "dd/MM/yyyy à HH:mm")}
                        </p>
                      </div>
                      {i !== 0 && (
                        <button
                          onClick={() => handleRestore(v.id)}
                          disabled={restoring === v.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-md hover:bg-gray-100 transition-colors disabled:opacity-50 flex-shrink-0"
                        >
                          {restoring === v.id ? (
                            <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <RotateCcw size={11} />
                          )}
                          Restaurer
                        </button>
                      )}
                      {i === 0 && (
                        <span className="text-xs text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full flex-shrink-0">
                          Actuelle
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
              <p className="text-xs text-gray-400">Les 20 dernières versions sont conservées automatiquement.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// suppress unused import warnings
void nanoid;
