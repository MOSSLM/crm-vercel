"use client";

import React from "react";
import { Plus, Trash2, Eye, EyeOff, GripVertical, Settings, ChevronUp, ChevronDown } from "lucide-react";
import { useSiteConfig } from "./use-site-config";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/utils";
import { getTheme } from "@/templates/index";
import type { SiteSection, SectionDataSource } from "@/types";
function nanoid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

interface SiteConfigEditorProps {
  onSave?: () => void;
  isSaving?: boolean;
}

const DATA_SOURCE_LABELS: Record<SectionDataSource, string> = {
  enterprise: "Entreprise",
  config: "Config",
  "client-editable": "Client",
  dynamic: "Dynamique",
};

const DATA_SOURCE_COLORS: Record<SectionDataSource, string> = {
  enterprise: "bg-blue-100 text-blue-700",
  config: "bg-gray-100 text-gray-700",
  "client-editable": "bg-green-100 text-green-700",
  dynamic: "bg-purple-100 text-purple-700",
};

const SiteConfigEditor: React.FC<SiteConfigEditorProps> = ({ onSave, isSaving }) => {
  const { state, dispatch } = useSiteConfig();
  const { config, selectedSectionId, isDirty } = state;
  const [addMenuOpen, setAddMenuOpen] = React.useState(false);

  const theme = getTheme(config.theme);
  const sections = config.sections;

  const selectedSection = sections.find((s) => s.id === selectedSectionId) ?? null;

  const handleAddSection = (type: string) => {
    const sectionDef = theme?.sections.find((s) => s.type === type);
    if (!sectionDef) return;
    const newSection: SiteSection = {
      id: nanoid(),
      type,
      dataSource: "config",
      data: { ...sectionDef.defaultData },
    };
    dispatch({ type: "ADD_SECTION", payload: { section: newSection } });
    setAddMenuOpen(false);
  };

  const handleRemove = (id: string) => {
    if (window.confirm("Supprimer cette section ?")) {
      dispatch({ type: "REMOVE_SECTION", payload: { sectionId: id } });
    }
  };

  const handleToggleVisibility = (id: string) => {
    dispatch({ type: "TOGGLE_SECTION_VISIBILITY", payload: { sectionId: id } });
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    dispatch({ type: "REORDER_SECTIONS", payload: { fromIndex: index, toIndex: index - 1 } });
  };

  const handleMoveDown = (index: number) => {
    if (index === sections.length - 1) return;
    dispatch({ type: "REORDER_SECTIONS", payload: { fromIndex: index, toIndex: index + 1 } });
  };

  const handleSelectSection = (id: string) => {
    dispatch({ type: "UPDATE_SECTION", payload: { sectionId: id, data: {} } }); // no-op to force re-render
    // set selected manually via a separate action if needed — for now just track in local state
  };

  return (
    <div className="flex h-full overflow-hidden bg-[#0f0f11]">
      {/* Left panel — section list */}
      <div className="w-72 flex-shrink-0 bg-[#18181b] border-r border-white/10 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-sm font-semibold text-white">Sections</h2>
          <div className="flex gap-2">
            {isDirty && onSave && (
              <Button size="sm" onClick={onSave} disabled={isSaving} className="text-xs h-7">
                {isSaving ? "Sauvegarde…" : "Sauvegarder"}
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-white/70 hover:text-white hover:bg-white/10"
              onClick={() => setAddMenuOpen((v) => !v)}
              title="Ajouter une section"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Add section menu */}
        {addMenuOpen && theme && (
          <div className="border-b border-white/10 p-3 bg-[#111113]">
            <p className="text-xs text-white/50 mb-2 uppercase tracking-wider">Ajouter une section</p>
            <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
              {theme.sections.map((s) => (
                <button
                  key={s.type}
                  type="button"
                  className="text-left text-sm px-3 py-2 rounded-md text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                  onClick={() => handleAddSection(s.type)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Sections list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sections.length === 0 && (
            <p className="text-xs text-white/30 text-center py-8">
              Aucune section.<br />Cliquez sur + pour en ajouter.
            </p>
          )}
          {sections.map((section, index) => {
            const def = theme?.sections.find((s) => s.type === section.type);
            const isSelected = section.id === selectedSectionId;
            return (
              <div
                key={section.id}
                className={cn(
                  "group flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors",
                  isSelected
                    ? "bg-blue-600/20 border border-blue-500/30"
                    : "hover:bg-white/5 border border-transparent"
                )}
                onClick={() => handleSelectSection(section.id)}
              >
                <GripVertical className="h-4 w-4 text-white/20 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className={cn("text-sm font-medium truncate", section.hidden ? "text-white/30 line-through" : "text-white/80")}>
                    {def?.label ?? section.type}
                  </p>
                  <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", DATA_SOURCE_COLORS[section.dataSource])}>
                    {DATA_SOURCE_LABELS[section.dataSource]}
                  </span>
                </div>
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    className="p-1 rounded text-white/40 hover:text-white hover:bg-white/10"
                    onClick={(e) => { e.stopPropagation(); handleMoveUp(index); }}
                    disabled={index === 0}
                    title="Monter"
                  >
                    <ChevronUp className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    className="p-1 rounded text-white/40 hover:text-white hover:bg-white/10"
                    onClick={(e) => { e.stopPropagation(); handleMoveDown(index); }}
                    disabled={index === sections.length - 1}
                    title="Descendre"
                  >
                    <ChevronDown className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    className="p-1 rounded text-white/40 hover:text-white hover:bg-white/10"
                    onClick={(e) => { e.stopPropagation(); handleToggleVisibility(section.id); }}
                    title={section.hidden ? "Afficher" : "Masquer"}
                  >
                    {section.hidden ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                  </button>
                  <button
                    type="button"
                    className="p-1 rounded text-white/40 hover:text-red-400 hover:bg-red-500/10"
                    onClick={(e) => { e.stopPropagation(); handleRemove(section.id); }}
                    title="Supprimer"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Center — live preview */}
      <div className="flex-1 overflow-auto bg-[#0f0f11] p-6">
        <div className="bg-white rounded-t-sm min-h-[calc(100vh-120px)] mx-auto max-w-5xl overflow-hidden shadow-2xl">
          {sections.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-64 text-gray-400">
              <p className="text-lg mb-2">Site vide</p>
              <p className="text-sm">Ajoutez des sections depuis le panneau gauche</p>
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-8">
              Aperçu disponible en mode live. <br />
              {sections.length} section(s) configurée(s).
            </p>
          )}
        </div>
      </div>

      {/* Right panel — section config */}
      {selectedSection && (
        <SectionConfigPanel
          section={selectedSection}
          dispatch={dispatch}
          themeDef={theme?.sections.find((s) => s.type === selectedSection.type)}
        />
      )}
    </div>
  );
};

// ─── Section config panel ────────────────────────────────────────────────────

import type { SiteConfigAction, SectionDataSource as SDS } from "@/types";
import type { SectionDefinition } from "@/types";

interface SectionConfigPanelProps {
  section: SiteSection;
  dispatch: React.Dispatch<SiteConfigAction>;
  themeDef?: SectionDefinition;
}

const DATA_SOURCES: SDS[] = ["enterprise", "config", "client-editable", "dynamic"];

const SectionConfigPanel: React.FC<SectionConfigPanelProps> = ({ section, dispatch, themeDef }) => {
  const [jsonText, setJsonText] = React.useState(() => JSON.stringify(section.data, null, 2));
  const [jsonError, setJsonError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setJsonText(JSON.stringify(section.data, null, 2));
    setJsonError(null);
  }, [section.id, section.data]);

  const handleJsonChange = (value: string) => {
    setJsonText(value);
    try {
      const parsed = JSON.parse(value);
      setJsonError(null);
      dispatch({ type: "UPDATE_SECTION", payload: { sectionId: section.id, data: { data: parsed } } });
    } catch {
      setJsonError("JSON invalide");
    }
  };

  const handleDataSourceChange = (ds: SDS) => {
    dispatch({ type: "UPDATE_SECTION", payload: { sectionId: section.id, data: { dataSource: ds } } });
  };

  return (
    <div className="w-80 flex-shrink-0 bg-[#18181b] border-l border-white/10 flex flex-col">
      <div className="p-4 border-b border-white/10 flex items-center gap-2">
        <Settings className="h-4 w-4 text-white/50" />
        <h3 className="text-sm font-semibold text-white truncate">
          {themeDef?.label ?? section.type}
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Data source selector */}
        <div>
          <label className="text-xs text-white/50 uppercase tracking-wider block mb-2">
            Source de données
          </label>
          <div className="grid grid-cols-2 gap-1">
            {DATA_SOURCES.map((ds) => (
              <button
                key={ds}
                type="button"
                className={cn(
                  "text-xs px-2 py-1.5 rounded border transition-colors text-left",
                  section.dataSource === ds
                    ? "border-blue-500 bg-blue-600/20 text-blue-300"
                    : "border-white/10 text-white/50 hover:border-white/30 hover:text-white/80"
                )}
                onClick={() => handleDataSourceChange(ds)}
              >
                {DATA_SOURCE_LABELS[ds]}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-white/30 mt-1.5">
            {section.dataSource === "enterprise" && "Données auto depuis la table entreprises (non modifiable par client)"}
            {section.dataSource === "config" && "Contenu stocké dans la config JSON (modifiable par nous)"}
            {section.dataSource === "client-editable" && "Le client peut modifier depuis son portail"}
            {section.dataSource === "dynamic" && "Données dynamiques (blog, avis API...)"}
          </p>
        </div>

        {/* JSON data editor */}
        <div>
          <label className="text-xs text-white/50 uppercase tracking-wider block mb-2">
            Données JSON
          </label>
          <textarea
            value={jsonText}
            onChange={(e) => handleJsonChange(e.target.value)}
            className={cn(
              "w-full font-mono text-xs bg-black/40 border rounded-lg p-3 text-white/80 resize-none focus:outline-none focus:ring-1",
              jsonError
                ? "border-red-500/50 focus:ring-red-500"
                : "border-white/10 focus:ring-blue-500"
            )}
            rows={18}
            spellCheck={false}
          />
          {jsonError && (
            <p className="text-red-400 text-xs mt-1">{jsonError}</p>
          )}
        </div>

        {themeDef?.description && (
          <p className="text-xs text-white/30 italic">{themeDef.description}</p>
        )}
      </div>
    </div>
  );
};

export default SiteConfigEditor;
