"use client";

import React from "react";
import {
  PanelGroup,
  Panel,
  PanelResizeHandle,
} from "react-resizable-panels";
import Link from "next/link";
import { ArrowLeft, BookOpen, Settings } from "lucide-react";
import { toast } from "sonner";
import SectionTree from "./SectionTree";
import SectionEditor from "./SectionEditor";
import SectionPreview from "./SectionPreview";
import SectionChat from "./SectionChat";
import SectionSettings from "./SectionSettings";
import SectionSchemaEditor from "./SectionSchemaEditor";
import type { ThemeSection } from "./types";
import { authedFetch } from "@/utils/authedFetch";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default function SectionsLibraryPage({ params }: PageProps) {
  const [slug, setSlug] = React.useState<string>("");
  const [sections, setSections] = React.useState<ThemeSection[]>([]);
  const [activeSection, setActiveSection] = React.useState<ThemeSection | null>(null);
  const [code, setCode] = React.useState("");
  const [unsaved, setUnsaved] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<"editor" | "schema">("editor");
  const [schema, setSchema] = React.useState<Record<string, unknown> | null>(null);

  // Resolve params
  React.useEffect(() => {
    params.then(({ slug: s }) => setSlug(s));
  }, [params]);

  const loadSections = React.useCallback(async (themeSlug: string) => {
    try {
      const res = await authedFetch(`/api/themes/${themeSlug}/sections`);
      if (!res.ok) throw new Error("Erreur de chargement");
      const data: ThemeSection[] = await res.json();
      setSections(data);
      return data;
    } catch {
      toast.error("Impossible de charger les sections");
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (slug) loadSections(slug);
  }, [slug, loadSections]);

  const handleSelectSection = (section: ThemeSection) => {
    if (unsaved && activeSection) {
      if (!confirm("Des modifications non sauvegardées seront perdues. Continuer ?")) return;
    }
    setActiveSection(section);
    setCode(section.code);
    setSchema((section.schema as Record<string, unknown> | null | undefined) ?? null);
    setUnsaved(false);
  };

  const handleCodeChange = (newCode: string) => {
    setCode(newCode);
    if (activeSection && newCode !== activeSection.code) {
      setUnsaved(true);
    } else {
      setUnsaved(false);
    }
  };

  const handleSave = React.useCallback(async () => {
    if (!activeSection || !slug || !unsaved) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/themes/${slug}/sections/${activeSection.section_id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        }
      );
      if (!res.ok) throw new Error("Erreur de sauvegarde");
      const updated: ThemeSection = await res.json();
      // Update local state
      setActiveSection(updated);
      setSections((prev) =>
        prev.map((s) => (s.section_id === updated.section_id ? updated : s))
      );
      setUnsaved(false);
      toast.success("Section sauvegardée");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }, [activeSection, slug, unsaved, code]);

  const handleApplyCode = (newCode: string) => {
    setCode(newCode);
    if (activeSection) setUnsaved(true);
  };

  const handleSchemaSave = React.useCallback(async (newSchema: Record<string, unknown>) => {
    if (!activeSection || !slug) return;
    const res = await fetch(
      `/api/themes/${slug}/sections/${activeSection.section_id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schema: newSchema }),
      }
    );
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error ?? "Erreur de sauvegarde du schéma");
    }
    const updated: ThemeSection = await res.json();
    setSchema((updated.schema as Record<string, unknown> | null | undefined) ?? null);
    setActiveSection(updated);
    setSections((prev) =>
      prev.map((s) => (s.section_id === updated.section_id ? updated : s))
    );
  }, [activeSection, slug]);

  const handleApplySchemaFromChat = React.useCallback(async (newSchema: Record<string, unknown>) => {
    if (!activeSection || !slug) return;
    try {
      await handleSchemaSave(newSchema);
      setSchema(newSchema);
      setActiveTab("schema");
    } catch {
      toast.error("Impossible de sauvegarder le schéma automatiquement");
    }
  }, [activeSection, slug, handleSchemaSave]);

  const handleRefresh = () => {
    if (slug) loadSections(slug);
  };

  const handleToggleAdaptive = React.useCallback(async () => {
    if (!activeSection || !slug) return;
    const next = !activeSection.is_tag_adaptive;
    try {
      const res = await fetch(
        `/api/themes/${slug}/sections/${activeSection.section_id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_tag_adaptive: next }),
        }
      );
      if (!res.ok) throw new Error("Erreur");
      const updated: ThemeSection = await res.json();
      setActiveSection(updated);
      setSections((prev) =>
        prev.map((s) => (s.section_id === updated.section_id ? updated : s))
      );
      toast.success(next ? "Section marquée adaptative" : "Section standard");
    } catch {
      toast.error("Impossible de modifier le type de section");
    }
  }, [activeSection, slug]);

  if (!slug) {
    return (
      <div className="flex items-center justify-center h-screen bg-zinc-950 text-zinc-500">
        Chargement…
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-white overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800 flex-shrink-0 bg-zinc-950 z-10">
        <Link
          href="/themes"
          className="flex items-center gap-1.5 text-zinc-400 hover:text-white text-xs transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Thèmes
        </Link>
        <span className="text-zinc-700">/</span>
        <div className="flex items-center gap-1.5 text-xs text-zinc-300">
          <BookOpen className="h-3.5 w-3.5 text-blue-400" />
          <span className="font-medium">Bibliothèque de sections</span>
          <span className="font-mono text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
            {slug}
          </span>
        </div>
        {loading && (
          <span className="text-xs text-zinc-600 animate-pulse">
            Chargement des sections…
          </span>
        )}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-zinc-600">
            {sections.length} section{sections.length !== 1 ? "s" : ""}
          </span>
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
            title="Réglages du prompt IA"
          >
            <Settings className="h-3.5 w-3.5" />
            Réglages
          </button>
        </div>
      </header>

      <SectionSettings themeSlug={slug} open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Main resizable layout */}
      <div className="flex-1 min-h-0">
        <PanelGroup direction="vertical" autoSaveId="sections-library-vertical">
          {/* Top row: tree + editor + preview */}
          <Panel defaultSize={68} minSize={30}>
            <PanelGroup direction="horizontal" autoSaveId="sections-library-horizontal">
              {/* Left: Section tree */}
              <Panel defaultSize={18} minSize={12} maxSize={35}>
                <SectionTree
                  themeSlug={slug}
                  sections={sections}
                  activeSectionId={activeSection?.section_id ?? null}
                  onSelect={handleSelectSection}
                  onRefresh={handleRefresh}
                  unsavedId={unsaved ? (activeSection?.section_id ?? null) : null}
                />
              </Panel>

              <PanelResizeHandle className="w-px bg-zinc-800 hover:bg-blue-500 transition-colors cursor-col-resize" />

              {/* Center: Editor / Schema tabs */}
              <Panel defaultSize={50} minSize={25}>
                <div className="flex flex-col h-full">
                  {/* Tab bar */}
                  <div className="flex items-center gap-0 border-b border-zinc-800 flex-shrink-0 px-2 pt-1">
                    <button
                      onClick={() => setActiveTab("editor")}
                      className={`px-3 py-1.5 text-xs font-medium rounded-t transition-colors ${
                        activeTab === "editor"
                          ? "bg-zinc-800 text-white"
                          : "text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      Éditeur
                    </button>
                    <button
                      onClick={() => setActiveTab("schema")}
                      className={`px-3 py-1.5 text-xs font-medium rounded-t transition-colors ${
                        activeTab === "schema"
                          ? "bg-zinc-800 text-white"
                          : "text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      Schéma
                      {schema && (
                        <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-green-500 align-middle" />
                      )}
                    </button>
                    {activeSection && (
                      <button
                        onClick={handleToggleAdaptive}
                        className={`ml-auto mr-1 px-2 py-1 text-[11px] font-medium rounded transition-colors ${
                          activeSection.is_tag_adaptive
                            ? "bg-blue-600/20 text-blue-300 border border-blue-600/40"
                            : "text-zinc-500 hover:text-zinc-300 border border-transparent"
                        }`}
                        title="Une section adaptative répète un élément par service de l'entreprise"
                      >
                        {activeSection.is_tag_adaptive ? "● Adaptative" : "○ Adaptative"}
                      </button>
                    )}
                  </div>
                  {/* Tab content */}
                  <div className="flex-1 min-h-0">
                    {activeTab === "editor" ? (
                      <SectionEditor
                        code={code}
                        onChange={handleCodeChange}
                        onSave={handleSave}
                        saving={saving}
                        unsaved={unsaved}
                        sectionId={activeSection?.section_id ?? null}
                      />
                    ) : (
                      <SectionSchemaEditor
                        themeSlug={slug}
                        sectionId={activeSection?.section_id ?? null}
                        code={code}
                        schema={schema}
                        isTagAdaptive={activeSection?.is_tag_adaptive ?? false}
                        onSchemaSave={handleSchemaSave}
                      />
                    )}
                  </div>
                </div>
              </Panel>

              <PanelResizeHandle className="w-px bg-zinc-800 hover:bg-blue-500 transition-colors cursor-col-resize" />

              {/* Right: Live Preview */}
              <Panel defaultSize={32} minSize={20}>
                <SectionPreview
                  code={code}
                  sectionId={activeSection?.section_id ?? null}
                  schema={schema}
                />
              </Panel>
            </PanelGroup>
          </Panel>

          <PanelResizeHandle className="h-px bg-zinc-800 hover:bg-blue-500 transition-colors cursor-row-resize" />

          {/* Bottom: AI Chat */}
          <Panel defaultSize={32} minSize={15} maxSize={60}>
            <SectionChat
              themeSlug={slug}
              sectionId={activeSection?.section_id ?? null}
              currentCode={code}
              isTagAdaptive={activeSection?.is_tag_adaptive ?? false}
              onApplyCode={handleApplyCode}
              onApplySchema={handleApplySchemaFromChat}
            />
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}
