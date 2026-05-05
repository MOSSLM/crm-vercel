"use client";

import React from "react";
import Link from "next/link";
import {
  Save, Globe, Laptop, Smartphone, Undo2, Redo2, Sparkles, Palette,
  Eye, Layers, ArrowLeft, Check
} from "lucide-react";
import { toast } from "sonner";
import type { SiteSectionDef, SiteSectionInstance, StyleGuide, SitemapPage } from "@/types";
import { DEFAULT_STYLE_GUIDE } from "@/types";
import { RelumeBuilderProvider, useRelumeBuilder, nanoid } from "./RelumeBuilderProvider";
import { SectionLibraryPanel } from "./SectionLibraryPanel";
import { StyleGuidePanel } from "./StyleGuidePanel";
import { PropertiesPanel } from "./PropertiesPanel";
import { AIPanel } from "./AIPanel";
import { RelumeCanvas } from "./RelumeCanvas";
import { PageTabsBar } from "./PageTabsBar";

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

  // Build lookup map for section defs
  const sectionDefs = React.useMemo(
    () => Object.fromEntries(initialSections.map((s) => [s.id, s])),
    [initialSections]
  );

  // Load initial data
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  // ─── Save ────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    try {
      // Save style guide and sitemap to site
      await fetch(`/api/site-builder-v2/sites/${siteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          style_guide: state.styleGuide,
          sitemap: state.sitemap,
        }),
      });

      // Save all section instances
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

  // ─── Left panel content ───────────────────────────────────────────────────────

  const renderLeftPanel = () => {
    if (state.aiPanelOpen) {
      return (
        <AIPanel
          siteId={siteId}
          enterpriseId={enterpriseId}
          availableSections={initialSections}
          onClose={() => dispatch({ type: "TOGGLE_AI_PANEL" })}
        />
      );
    }
    if (state.stylePanelOpen) {
      return <StyleGuidePanel />;
    }
    return <SectionLibraryPanel sections={initialSections} />;
  };

  const canUndo = state.historyIndex >= 0;
  const canRedo = state.historyIndex < state.history.length - 1;

  return (
    <div className="flex flex-col h-screen bg-[#0f0f11] text-white overflow-hidden">

      {/* ─ Top Bar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-white/10 bg-[#0f0f11] flex-shrink-0 z-40">

        {/* Back */}
        <Link
          href="/site-builder-v2"
          className="flex items-center gap-1.5 text-white/40 hover:text-white/80 transition-colors text-sm mr-1"
        >
          <ArrowLeft size={15} />
        </Link>

        {/* Site name */}
        <div className="flex items-center gap-2">
          <div
            className="w-5 h-5 rounded"
            style={{ backgroundColor: state.styleGuide.colors.primary }}
          />
          <span className="text-sm font-medium text-white/80">{siteName}</span>
        </div>

        {/* Dirty indicator */}
        {state.isDirty && (
          <span className="text-xs text-amber-400/60 bg-amber-400/10 px-1.5 py-0.5 rounded">
            Non sauvegardé
          </span>
        )}

        <div className="flex-1" />

        {/* Left panel toggles */}
        <div className="flex items-center gap-1">
          <TopBarButton
            active={state.libraryOpen && !state.aiPanelOpen && !state.stylePanelOpen}
            onClick={() => {
              dispatch({ type: "TOGGLE_LIBRARY" });
              if (state.aiPanelOpen) dispatch({ type: "TOGGLE_AI_PANEL" });
              if (state.stylePanelOpen) dispatch({ type: "TOGGLE_STYLE_PANEL" });
            }}
            title="Bibliothèque"
          >
            <Layers size={15} />
          </TopBarButton>
          <TopBarButton
            active={state.stylePanelOpen}
            onClick={() => dispatch({ type: "TOGGLE_STYLE_PANEL" })}
            title="Style Guide"
          >
            <Palette size={15} />
          </TopBarButton>
          <TopBarButton
            active={state.aiPanelOpen}
            onClick={() => dispatch({ type: "TOGGLE_AI_PANEL" })}
            title="Assistant IA"
            className="text-purple-400"
          >
            <Sparkles size={15} />
          </TopBarButton>
        </div>

        <div className="h-5 w-px bg-white/10" />

        {/* Device toggle */}
        <div className="flex items-center gap-1">
          <TopBarButton
            active={state.deviceView === "desktop"}
            onClick={() => dispatch({ type: "SET_DEVICE_VIEW", payload: "desktop" })}
            title="Desktop"
          >
            <Laptop size={15} />
          </TopBarButton>
          <TopBarButton
            active={state.deviceView === "mobile"}
            onClick={() => dispatch({ type: "SET_DEVICE_VIEW", payload: "mobile" })}
            title="Mobile"
          >
            <Smartphone size={15} />
          </TopBarButton>
        </div>

        <div className="h-5 w-px bg-white/10" />

        {/* Undo / Redo */}
        <div className="flex items-center gap-1">
          <TopBarButton
            onClick={() => dispatch({ type: "UNDO" })}
            disabled={!canUndo}
            title="Annuler (Ctrl+Z)"
          >
            <Undo2 size={15} />
          </TopBarButton>
          <TopBarButton
            onClick={() => dispatch({ type: "REDO" })}
            disabled={!canRedo}
            title="Refaire (Ctrl+Y)"
          >
            <Redo2 size={15} />
          </TopBarButton>
        </div>

        <div className="h-5 w-px bg-white/10" />

        {/* Preview */}
        {isPublished && publishedSubdomain && (
          <a
            href={`https://${publishedSubdomain}.${process.env.NEXT_PUBLIC_SITE_DOMAIN ?? "monsupercrm.fr"}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white/60 hover:text-white/90 border border-white/10 hover:border-white/20 rounded-md transition-all"
          >
            <Eye size={13} />
            Prévisualiser
          </a>
        )}

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving || !state.isDirty}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10 hover:border-white/20 rounded-md transition-all disabled:opacity-40"
        >
          {saving ? (
            <div className="w-3 h-3 border border-white/40 border-t-transparent rounded-full animate-spin" />
          ) : state.isDirty ? (
            <Save size={13} />
          ) : (
            <Check size={13} className="text-green-400" />
          )}
          {saving ? "Sauvegarde..." : "Enregistrer"}
        </button>

        {/* Publish */}
        <div className="relative">
          <button
            onClick={() => setShowPublish(!showPublish)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-md transition-all font-medium"
          >
            <Globe size={13} />
            {isPublished ? "Republier" : "Publier"}
          </button>
          {showPublish && (
            <div className="absolute top-full right-0 mt-2 w-72 bg-[#1a1a1e] border border-white/15 rounded-xl shadow-2xl p-4 z-50">
              <div className="text-sm font-semibold mb-3 text-white">Publier le site</div>
              <div className="flex items-center gap-1 mb-3">
                <input
                  type="text"
                  value={publishDomain}
                  onChange={(e) => setPublishDomain(e.target.value.replace(/[^a-z0-9-]/g, ""))}
                  placeholder="mon-site"
                  className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500/50"
                />
                <span className="text-xs text-white/30">.{process.env.NEXT_PUBLIC_SITE_DOMAIN ?? "site.fr"}</span>
              </div>
              <button
                onClick={handlePublish}
                disabled={publishing || !publishDomain.trim()}
                className="w-full py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-all disabled:opacity-50"
              >
                {publishing ? "Publication..." : "Publier"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ─ Page Tabs ─────────────────────────────────────────────────────────── */}
      <PageTabsBar />

      {/* ─ Main Layout ───────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* Left Panel */}
        {(state.libraryOpen || state.aiPanelOpen || state.stylePanelOpen) && (
          <div className="w-64 flex-shrink-0 border-r border-white/10 bg-[#0f0f11] flex flex-col overflow-hidden">
            {renderLeftPanel()}
          </div>
        )}

        {/* Canvas area */}
        <RelumeCanvas
          sectionDefs={sectionDefs}
          onAddSection={() => {
            if (!state.libraryOpen || state.aiPanelOpen || state.stylePanelOpen) {
              if (state.aiPanelOpen) dispatch({ type: "TOGGLE_AI_PANEL" });
              if (state.stylePanelOpen) dispatch({ type: "TOGGLE_STYLE_PANEL" });
              if (!state.libraryOpen) dispatch({ type: "TOGGLE_LIBRARY" });
            }
          }}
        />

        {/* Right Panel: Properties */}
        {state.selectedInstanceId && (
          <div className="w-72 flex-shrink-0 border-l border-white/10 bg-[#0f0f11] flex flex-col overflow-hidden">
            <PropertiesPanel onRegenerateSection={handleRegenerateSection} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Top Bar Button ───────────────────────────────────────────────────────────

function TopBarButton({
  children,
  active,
  disabled,
  onClick,
  title,
  className = "",
}: {
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded transition-all ${
        active
          ? "bg-white/10 text-white"
          : "text-white/40 hover:text-white/80 hover:bg-white/5"
      } disabled:opacity-30 disabled:cursor-not-allowed ${className}`}
    >
      {children}
    </button>
  );
}
