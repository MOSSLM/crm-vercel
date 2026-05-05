"use client";

import React from "react";
import { Save, Globe, Check, Share2, Upload, Users } from "lucide-react";
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
      await fetch(`/api/site-builder-v2/sites/${siteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ style_guide: state.styleGuide, sitemap: state.sitemap }),
      });
      const instances = Object.values(state.instances);
      await fetch(`/api/site-builder-v2/sites/${siteId}/instances`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instances }),
      });
      dispatch({ type: "MARK_SAVED" });
      toast.success("Sauvegardé");
    } catch {
      toast.error("Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  // ─── Publish ─────────────────────────────────────────────────────────────────

  const handlePublish = async () => {
    if (!publishDomain.trim()) return;
    setPublishing(true);
    try {
      const res = await fetch(`/api/site-builder-v2/sites/${siteId}/publish`, {
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

  const handleRegenerateSection = async (instanceId: string, prompt: string) => {
    const instance = state.instances[instanceId];
    const sectionDef = instance?.section_def ?? (instance?.section_id ? sectionDefs[instance.section_id] : null);
    if (!instance || !sectionDef) return;
    try {
      const res = await fetch("/api/site-builder-v2/ai/regenerate-section", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId,
          instanceId,
          sectionType: sectionDef.type,
          currentContent: instance.content,
          defaultContent: sectionDef.default_content,
          prompt,
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
    </div>
  );
}

// suppress unused import warnings
void nanoid;
