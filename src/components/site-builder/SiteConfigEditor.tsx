"use client";

import React from "react";
import ReactDOM from "react-dom";
import {
  Plus, Trash2, Eye, EyeOff, GripVertical, Settings,
  ChevronUp, ChevronDown, Laptop, Tablet, Smartphone,
  PanelLeft, Globe, Sparkles, ArrowLeft, Save,
  LayoutTemplate, X, FileText, Home, Cog,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/components/ui/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useSiteConfig } from "./use-site-config";
import { getTheme } from "@/templates/index";
import SectionRenderer from "@/components/site-builder/SectionRenderer";
import type {
  SiteSection, SectionDataSource as SDS, SitePage, SectionAnimation,
  SectionDefinition, SiteConfigAction, ThemeGlobalVariables, SiteGlobalSettings,
} from "@/types";

function nanoid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

type Device = "Desktop" | "Tablet" | "Mobile";

const DEVICE_WIDTHS: Record<Device, string> = {
  Desktop: "100%",
  Tablet: "768px",
  Mobile: "390px",
};

const ANIMATION_LABELS: Record<SectionAnimation, string> = {
  none: "Aucune",
  "fade-in": "Fondu",
  "slide-up": "Glisse haut",
  "slide-in-left": "Glisse gauche",
  "slide-in-right": "Glisse droite",
};

interface SiteConfigEditorProps {
  siteName: string;
  siteId: string;
  isPublished: boolean;
  publishedSubdomain?: string;
  onSave?: () => void;
  isSaving?: boolean;
  onPublish?: () => void;
  onUnpublish?: () => void;
  onGenerateAI?: () => void;
  isGenerating?: boolean;
}

// ─── Portal Dropdown ──────────────────────────────────────────────────────────

interface PortalDropdownProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  align?: "left" | "right";
}

function PortalDropdown({ anchorRef, open, onClose, children, align = "left" }: PortalDropdownProps) {
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);

  React.useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setPos({
      top: rect.bottom + window.scrollY + 4,
      left: align === "right" ? rect.right - 208 : rect.left,
    });
  }, [open, anchorRef, align]);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose, anchorRef]);

  if (!open || !pos) return null;

  return ReactDOM.createPortal(
    <div
      style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 99999 }}
      className="w-52 bg-[#111113] border border-white/10 rounded-lg shadow-2xl py-1"
    >
      {children}
    </div>,
    document.body
  );
}

// ─── Main Editor Component ───────────────────────────────────────────────────

const SiteConfigEditor: React.FC<SiteConfigEditorProps> = ({
  siteName,
  siteId,
  isPublished,
  publishedSubdomain,
  onSave,
  isSaving,
  onPublish,
  onUnpublish,
  onGenerateAI,
  isGenerating,
}) => {
  const { state, dispatch } = useSiteConfig();
  const { config, selectedSectionId, isDirty, activePageId } = state;
  const [device, setDevice] = React.useState<Device>("Desktop");
  const [previewMode, setPreviewMode] = React.useState(false);
  const [leftPanelOpen, setLeftPanelOpen] = React.useState(true);
  const [addSectionMenuOpen, setAddSectionMenuOpen] = React.useState(false);
  const [settingsPanelOpen, setSettingsPanelOpen] = React.useState(false);
  const [addPageDialogOpen, setAddPageDialogOpen] = React.useState(false);
  const [newPageSlug, setNewPageSlug] = React.useState("");
  const [newPageTitle, setNewPageTitle] = React.useState("");

  const addSectionBtnRef = React.useRef<HTMLButtonElement>(null);
  const settingsBtnRef = React.useRef<HTMLButtonElement>(null);

  const theme = getTheme(config.theme);
  const pages = config.pages ?? [];
  const activePage = pages.find((p) => p.id === activePageId) ?? pages[0] ?? null;
  const sections = activePage?.sections ?? [];
  const selectedSection = sections.find((s) => s.id === selectedSectionId) ?? null;

  // Keyboard shortcuts
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        onSave?.();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "p") {
        e.preventDefault();
        setPreviewMode((v) => !v);
      }
      if (e.key === "Escape") {
        setPreviewMode(false);
        setAddSectionMenuOpen(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onSave]);

  const handleAddSection = (type: string) => {
    const sectionDef = theme?.sections.find((s) => s.type === type);
    if (!sectionDef) return;
    const newSection: SiteSection = {
      id: nanoid(),
      type,
      dataSource: "config",
      data: { ...sectionDef.defaultData },
      animation: "none",
    };
    dispatch({ type: "ADD_SECTION", payload: { section: newSection, pageId: activePage?.id } });
    setAddSectionMenuOpen(false);
  };

  const handleRemoveSection = (id: string) => {
    if (window.confirm("Supprimer cette section ?")) {
      dispatch({ type: "REMOVE_SECTION", payload: { sectionId: id, pageId: activePage?.id } });
    }
  };

  const handleToggleVisibility = (id: string) => {
    dispatch({ type: "TOGGLE_SECTION_VISIBILITY", payload: { sectionId: id, pageId: activePage?.id } });
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    dispatch({ type: "REORDER_SECTIONS", payload: { fromIndex: index, toIndex: index - 1, pageId: activePage?.id } });
  };

  const handleMoveDown = (index: number) => {
    if (index === sections.length - 1) return;
    dispatch({ type: "REORDER_SECTIONS", payload: { fromIndex: index, toIndex: index + 1, pageId: activePage?.id } });
  };

  const handleSelectSection = (id: string) => {
    dispatch({ type: "SELECT_SECTION", payload: { sectionId: id } });
    setSettingsPanelOpen(false);
  };

  const handleAddPage = () => {
    if (!newPageTitle.trim()) return;
    const slug = newPageSlug.trim() || `/${newPageTitle.toLowerCase().replace(/\s+/g, "-")}`;
    const normalizedSlug = slug.startsWith("/") ? slug : `/${slug}`;
    dispatch({
      type: "ADD_PAGE",
      payload: {
        page: {
          id: `page-${nanoid()}`,
          slug: normalizedSlug,
          title: newPageTitle.trim(),
          sections: [],
        },
      },
    });
    setAddPageDialogOpen(false);
    setNewPageSlug("");
    setNewPageTitle("");
  };

  const handleRemovePage = (pageId: string) => {
    if (pages.length <= 1) return;
    if (window.confirm("Supprimer cette page ?")) {
      dispatch({ type: "REMOVE_PAGE", payload: { pageId } });
    }
  };

  // CSS variables for live design tokens preview
  const canvasVars: React.CSSProperties = {
    "--color-primary": config.settings?.colors?.primary ?? "#1a56db",
    "--color-secondary": config.settings?.colors?.secondary ?? "#6b7280",
    "--color-accent": config.settings?.colors?.accent ?? "#f59e0b",
    "--color-background": config.settings?.colors?.background ?? "#ffffff",
    "--color-text": config.settings?.colors?.text ?? "#111827",
    "--font-heading": config.settings?.fonts?.heading ?? "Inter",
    "--font-body": config.settings?.fonts?.body ?? "Inter",
    "--font-base-size": config.settings?.fonts?.baseSize ?? "16px",
    "--btn-radius": config.settings?.buttons?.borderRadius ?? "8px",
    "--card-radius": config.settings?.cards?.borderRadius ?? "8px",
    "--section-padding": config.settings?.spacing?.sectionPadding ?? "80px",
    "--element-gap": config.settings?.spacing?.elementGap ?? "24px",
  } as React.CSSProperties;

  // Preview mode (full-screen)
  if (previewMode) {
    return (
      <div className="fixed inset-0 z-50 bg-white overflow-auto">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPreviewMode(false)}
          className="absolute top-4 left-4 z-10 gap-2 shadow-lg"
        >
          <EyeOff className="h-4 w-4" />
          Quitter l'aperçu
        </Button>
        <div className="bg-white">
          {sections.filter((s) => !s.hidden).map((section) => (
            <SectionRenderer key={section.id} section={section} variables={{}} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col h-screen bg-zinc-950 overflow-hidden">
        {/* ── Top Navigation Bar ──────────────────────────────────────────── */}
        <nav className="h-[53px] flex-shrink-0 border-b border-white/10 bg-[#18181b] grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 z-40">
          {/* Left */}
          <div className="flex items-center gap-1 min-w-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn("h-8 w-8 shrink-0 text-white/70 hover:text-white hover:bg-white/10", leftPanelOpen && "bg-white/10 text-white")}
                  onClick={() => setLeftPanelOpen((v) => !v)}
                >
                  <PanelLeft className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{leftPanelOpen ? "Masquer" : "Afficher"} le panneau</TooltipContent>
            </Tooltip>

            <Link href="/site-builder-v2" className="shrink-0">
              <Button variant="ghost" size="icon" className="h-8 w-8 text-white/70 hover:text-white hover:bg-white/10">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>

            <div className="w-px h-5 bg-white/10 shrink-0 mx-1" />

            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-medium text-white/90 truncate max-w-40">{siteName}</span>
              <Badge variant={isPublished ? "default" : "secondary"} className="text-[10px] h-5 shrink-0">
                {isPublished ? "Publié" : "Brouillon"}
              </Badge>
              {isDirty && (
                <span className="text-[10px] text-amber-400 shrink-0">● Non sauvegardé</span>
              )}
            </div>
          </div>

          {/* Center - Device switcher */}
          <div className="flex items-center justify-center">
            <Tabs value={device} onValueChange={(v) => setDevice(v as Device)}>
              <TabsList className="flex gap-1 bg-transparent h-fit p-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <TabsTrigger value="Desktop" className="data-[state=active]:bg-white/10 w-8 h-8 p-0 rounded-md border border-white/10 bg-transparent text-white/60 data-[state=active]:text-white">
                      <Laptop className="w-3.5 h-3.5" />
                    </TabsTrigger>
                  </TooltipTrigger>
                  <TooltipContent>Bureau</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <TabsTrigger value="Tablet" className="data-[state=active]:bg-white/10 w-8 h-8 p-0 rounded-md border border-white/10 bg-transparent text-white/60 data-[state=active]:text-white">
                      <Tablet className="w-3.5 h-3.5" />
                    </TabsTrigger>
                  </TooltipTrigger>
                  <TooltipContent>Tablette</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <TabsTrigger value="Mobile" className="data-[state=active]:bg-white/10 w-8 h-8 p-0 rounded-md border border-white/10 bg-transparent text-white/60 data-[state=active]:text-white">
                      <Smartphone className="w-3.5 h-3.5" />
                    </TabsTrigger>
                  </TooltipTrigger>
                  <TooltipContent>Mobile</TooltipContent>
                </Tooltip>
              </TabsList>
            </Tabs>
          </div>

          {/* Right - Actions */}
          <div className="flex items-center justify-end gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-white/70 hover:text-white hover:bg-white/10"
                  onClick={() => setPreviewMode(true)}
                >
                  <Eye className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Aperçu (⌘P)</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  ref={settingsBtnRef}
                  variant="ghost"
                  size="icon"
                  className={cn("h-8 w-8 text-white/70 hover:text-white hover:bg-white/10", settingsPanelOpen && "bg-white/10 text-white")}
                  onClick={() => {
                    setSettingsPanelOpen((v) => !v);
                    dispatch({ type: "SELECT_SECTION", payload: { sectionId: null } });
                  }}
                >
                  <Cog className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Paramètres du site</TooltipContent>
            </Tooltip>

            {onGenerateAI && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onGenerateAI}
                    disabled={isGenerating}
                    className="h-8 gap-1.5 text-xs text-white/70 hover:text-white hover:bg-white/10 hidden sm:flex"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {isGenerating ? "IA…" : "IA"}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Générer avec l'IA</TooltipContent>
              </Tooltip>
            )}

            {isPublished ? (
              <Button variant="outline" size="sm" onClick={onUnpublish} className="h-8 gap-1.5 text-xs border-white/20 text-white/70 hover:text-white bg-transparent hover:bg-white/10">
                <Globe className="h-3.5 w-3.5" />
                Dépublier
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={onPublish} className="h-8 gap-1.5 text-xs border-white/20 text-white/70 hover:text-white bg-transparent hover:bg-white/10">
                <Globe className="h-3.5 w-3.5" />
                Publier
              </Button>
            )}

            <Button
              size="sm"
              onClick={onSave}
              disabled={isSaving || !isDirty}
              className="h-8 gap-1.5 text-xs"
            >
              <Save className="h-3.5 w-3.5" />
              {isSaving ? "…" : "Sauver"}
            </Button>
          </div>
        </nav>

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <div className="flex flex-1 min-h-0 relative">

          {/* ── Left Panel ────────────────────────────────────────────────── */}
          <div
            className={cn(
              "flex-shrink-0 flex flex-col bg-[#18181b] border-r border-white/10 transition-all duration-200",
              leftPanelOpen ? "w-64" : "w-0 overflow-hidden"
            )}
          >
            {leftPanelOpen && (
              <div className="flex flex-col h-full overflow-hidden">
                {/* Pages zone */}
                <div className="flex-shrink-0 border-b border-white/10">
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">Pages</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-white/60 hover:text-white hover:bg-white/10"
                          onClick={() => setAddPageDialogOpen(true)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Ajouter une page</TooltipContent>
                    </Tooltip>
                  </div>

                  <div className="px-2 pb-2 space-y-0.5 max-h-40 overflow-y-auto">
                    {pages.map((page) => {
                      const isActivePg = page.id === (activePage?.id);
                      return (
                        <div
                          key={page.id}
                          className={cn(
                            "group flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer transition-colors",
                            isActivePg
                              ? "bg-blue-600/20 border border-blue-500/30"
                              : "hover:bg-white/5 border border-transparent"
                          )}
                          onClick={() => dispatch({ type: "SET_ACTIVE_PAGE", payload: { pageId: page.id } })}
                        >
                          {page.slug === "/" ? (
                            <Home className="h-3 w-3 text-white/40 shrink-0" />
                          ) : (
                            <FileText className="h-3 w-3 text-white/30 shrink-0" />
                          )}
                          <span className={cn(
                            "flex-1 text-xs truncate",
                            isActivePg ? "text-white" : "text-white/60"
                          )}>
                            {page.title}
                          </span>
                          <span className="text-[10px] text-white/25 truncate max-w-20 shrink-0">
                            {page.slug}
                          </span>
                          {pages.length > 1 && (
                            <button
                              type="button"
                              className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-opacity"
                              onClick={(e) => { e.stopPropagation(); handleRemovePage(page.id); }}
                              title="Supprimer la page"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Add page dialog (inline) */}
                {addPageDialogOpen && (
                  <div className="border-b border-white/10 px-3 py-3 bg-white/5">
                    <p className="text-xs text-white/50 mb-2">Nouvelle page</p>
                    <Input
                      placeholder="Titre (ex: Services)"
                      value={newPageTitle}
                      onChange={(e) => setNewPageTitle(e.target.value)}
                      className="h-7 text-xs bg-black/30 border-white/10 text-white mb-1.5"
                      onKeyDown={(e) => { if (e.key === "Enter") handleAddPage(); if (e.key === "Escape") setAddPageDialogOpen(false); }}
                      autoFocus
                    />
                    <Input
                      placeholder="Slug (ex: /services)"
                      value={newPageSlug}
                      onChange={(e) => setNewPageSlug(e.target.value)}
                      className="h-7 text-xs bg-black/30 border-white/10 text-white mb-2"
                    />
                    <div className="flex gap-1.5">
                      <Button size="sm" className="h-6 text-xs flex-1 px-2" onClick={handleAddPage} disabled={!newPageTitle.trim()}>
                        Créer
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 text-xs text-white/50" onClick={() => { setAddPageDialogOpen(false); setNewPageSlug(""); setNewPageTitle(""); }}>
                        Annuler
                      </Button>
                    </div>
                  </div>
                )}

                {/* Sections zone */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10 flex-shrink-0">
                  <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">
                    Sections
                    {activePage && activePage.slug !== "/" && (
                      <span className="ml-1 text-white/25 normal-case font-normal">— {activePage.title}</span>
                    )}
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        ref={addSectionBtnRef}
                        type="button"
                        className="h-6 w-6 flex items-center justify-center rounded text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                        onClick={() => setAddSectionMenuOpen((v) => !v)}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Ajouter une section</TooltipContent>
                  </Tooltip>

                  {/* Portal dropdown — escapes overflow-hidden */}
                  <PortalDropdown
                    anchorRef={addSectionBtnRef}
                    open={addSectionMenuOpen}
                    onClose={() => setAddSectionMenuOpen(false)}
                  >
                    <p className="text-[10px] text-white/30 uppercase tracking-wider px-3 pt-2 pb-1">
                      Ajouter une section
                    </p>
                    {theme?.sections.map((s) => (
                      <button
                        key={s.type}
                        type="button"
                        className="w-full text-left text-sm px-3 py-2 text-white/70 hover:text-white hover:bg-white/10 transition-colors flex items-center gap-2"
                        onClick={() => handleAddSection(s.type)}
                      >
                        <LayoutTemplate className="h-3.5 w-3.5 text-white/30 shrink-0" />
                        {s.label}
                      </button>
                    ))}
                  </PortalDropdown>
                </div>

                {/* Section list */}
                <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
                  {sections.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <LayoutTemplate className="h-7 w-7 text-white/15 mb-2" />
                      <p className="text-xs text-white/30">Aucune section.</p>
                      <p className="text-xs text-white/20">Cliquez sur + pour en ajouter.</p>
                    </div>
                  )}
                  {sections.map((section, index) => {
                    const def = theme?.sections.find((s) => s.type === section.type);
                    const isSelected = section.id === selectedSectionId;
                    return (
                      <div
                        key={section.id}
                        className={cn(
                          "group flex items-center gap-1.5 px-2 py-2 rounded-lg cursor-pointer transition-colors",
                          isSelected
                            ? "bg-blue-600/20 border border-blue-500/30"
                            : "hover:bg-white/5 border border-transparent"
                        )}
                        onClick={() => handleSelectSection(section.id)}
                      >
                        <GripVertical className="h-3.5 w-3.5 text-white/15 shrink-0" />
                        <span className={cn(
                          "flex-1 text-sm truncate",
                          section.hidden ? "text-white/25 line-through" : isSelected ? "text-white" : "text-white/70"
                        )}>
                          {def?.label ?? section.type}
                        </span>

                        <div className={cn(
                          "flex items-center gap-0.5 transition-opacity",
                          isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                        )}>
                          <button
                            type="button"
                            className="p-0.5 rounded text-white/30 hover:text-white hover:bg-white/10 disabled:opacity-20"
                            onClick={(e) => { e.stopPropagation(); handleMoveUp(index); }}
                            disabled={index === 0}
                          >
                            <ChevronUp className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            className="p-0.5 rounded text-white/30 hover:text-white hover:bg-white/10 disabled:opacity-20"
                            onClick={(e) => { e.stopPropagation(); handleMoveDown(index); }}
                            disabled={index === sections.length - 1}
                          >
                            <ChevronDown className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            className="p-0.5 rounded text-white/30 hover:text-white hover:bg-white/10"
                            onClick={(e) => { e.stopPropagation(); handleToggleVisibility(section.id); }}
                          >
                            {section.hidden ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                          </button>
                          <button
                            type="button"
                            className="p-0.5 rounded text-white/30 hover:text-red-400 hover:bg-red-500/10"
                            onClick={(e) => { e.stopPropagation(); handleRemoveSection(section.id); }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Published link */}
                {isPublished && publishedSubdomain && (
                  <div className="border-t border-white/10 px-4 py-3 flex-shrink-0">
                    <a
                      href={`https://${publishedSubdomain}.monsupercrm.fr`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1"
                    >
                      <Globe className="h-3 w-3" />
                      {publishedSubdomain}.monsupercrm.fr ↗
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Center Canvas ─────────────────────────────────────────────── */}
          <div
            className="flex-1 overflow-auto bg-[#0f0f11]"
            style={{
              backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
              backgroundSize: "20px 20px",
            }}
          >
            <div className="min-h-full py-8 px-6 flex flex-col items-center">
              {/* Simulated URL bar */}
              <div
                className="mb-3 flex items-center gap-2 bg-[#18181b] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white/50"
                style={{ width: DEVICE_WIDTHS[device], maxWidth: "100%" }}
              >
                <Globe className="h-3 w-3 text-white/25 shrink-0" />
                <span className="flex-1 truncate font-mono">
                  {isPublished && publishedSubdomain
                    ? `https://${publishedSubdomain}.monsupercrm.fr${activePage?.slug ?? "/"}`
                    : `preview${activePage?.slug ?? "/"}`
                  }
                </span>
                {activePage && (
                  <span className="text-white/25 shrink-0">{activePage.title}</span>
                )}
              </div>

              <div
                className="bg-white shadow-2xl overflow-hidden transition-all duration-300"
                style={{
                  ...canvasVars,
                  width: DEVICE_WIDTHS[device],
                  maxWidth: "100%",
                  minHeight: "calc(100vh - 160px)",
                  boxShadow: "0 0 0 1px rgba(255,255,255,0.05), 0 32px 80px rgba(0,0,0,0.6)",
                  borderRadius: device === "Desktop" ? "4px 4px 0 0" : "16px",
                }}
                onClick={() => {
                  dispatch({ type: "SELECT_SECTION", payload: { sectionId: null } });
                  setSettingsPanelOpen(false);
                }}
              >
                {sections.length === 0 ? (
                  <div className="flex flex-col items-center justify-center min-h-64 text-gray-400 py-20">
                    <LayoutTemplate className="h-12 w-12 text-gray-200 mb-4" />
                    <p className="text-lg font-medium text-gray-300">Page vide</p>
                    <p className="text-sm text-gray-400 mt-1">Ajoutez des sections depuis le panneau gauche</p>
                  </div>
                ) : (
                  sections.map((section) => {
                    if (section.hidden) return null;
                    return (
                      <div
                        key={section.id}
                        className={cn(
                          "relative cursor-pointer transition-all",
                          section.id === selectedSectionId && "ring-2 ring-blue-500 ring-inset"
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectSection(section.id);
                        }}
                      >
                        {section.id === selectedSectionId && (
                          <div className="absolute top-0 left-0 z-10 bg-blue-500 text-white text-[10px] font-medium px-2 py-0.5 rounded-br">
                            {theme?.sections.find((s) => s.type === section.type)?.label ?? section.type}
                          </div>
                        )}
                        <SectionRenderer section={section} variables={{}} />
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* ── Right Panel ───────────────────────────────────────────────── */}
          {selectedSection ? (
            <SectionConfigPanel
              section={selectedSection}
              dispatch={dispatch}
              themeDef={theme?.sections.find((s) => s.type === selectedSection.type)}
              pageId={activePage?.id}
              onClose={() => dispatch({ type: "SELECT_SECTION", payload: { sectionId: null } })}
            />
          ) : settingsPanelOpen ? (
            <SiteSettingsPanelWrapper
              settings={config.settings}
              dispatch={dispatch}
              onClose={() => setSettingsPanelOpen(false)}
            />
          ) : null}
        </div>
      </div>
    </TooltipProvider>
  );
};

// ─── Site Settings Panel Wrapper ─────────────────────────────────────────────

import SiteSettingsPanel from "./SiteSettingsPanel";

type SiteSettings = ThemeGlobalVariables & { siteSettings?: SiteGlobalSettings };

const SiteSettingsPanelWrapper: React.FC<{
  settings: SiteSettings;
  dispatch: React.Dispatch<SiteConfigAction>;
  onClose: () => void;
}> = ({ settings, dispatch, onClose }) => {
  return (
    <SiteSettingsPanel
      settings={settings}
      onUpdate={(patch) => dispatch({ type: "UPDATE_SETTINGS", payload: { settings: patch } })}
      onClose={onClose}
    />
  );
};

// ─── Section Config Panel ────────────────────────────────────────────────────

const DATA_SOURCE_LABELS: Record<SDS, string> = {
  enterprise: "Entreprise",
  config: "Config",
  "client-editable": "Client",
  dynamic: "Dynamique",
};

const DATA_SOURCES: SDS[] = ["enterprise", "config", "client-editable", "dynamic"];

interface SectionConfigPanelProps {
  section: SiteSection;
  dispatch: React.Dispatch<SiteConfigAction>;
  themeDef?: SectionDefinition;
  pageId?: string;
  onClose: () => void;
}

const SectionConfigPanel: React.FC<SectionConfigPanelProps> = ({
  section,
  dispatch,
  themeDef,
  pageId,
  onClose,
}) => {
  const [tab, setTab] = React.useState<"form" | "json">("form");
  const [jsonText, setJsonText] = React.useState(() => JSON.stringify(section.data, null, 2));
  const [jsonError, setJsonError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setJsonText(JSON.stringify(section.data, null, 2));
    setJsonError(null);
  }, [section.id]);

  const handleJsonChange = (value: string) => {
    setJsonText(value);
    try {
      const parsed = JSON.parse(value);
      setJsonError(null);
      dispatch({ type: "UPDATE_SECTION", payload: { sectionId: section.id, data: { data: parsed }, pageId } });
    } catch {
      setJsonError("JSON invalide");
    }
  };

  const handleFieldChange = (key: string, value: unknown) => {
    const newData = { ...section.data, [key]: value };
    dispatch({ type: "UPDATE_SECTION", payload: { sectionId: section.id, data: { data: newData }, pageId } });
    setJsonText(JSON.stringify(newData, null, 2));
  };

  const handleDataSourceChange = (ds: SDS) => {
    dispatch({ type: "UPDATE_SECTION", payload: { sectionId: section.id, data: { dataSource: ds }, pageId } });
  };

  const handleAnimationChange = (anim: SectionAnimation) => {
    dispatch({ type: "UPDATE_SECTION", payload: { sectionId: section.id, data: { animation: anim }, pageId } });
  };

  return (
    <div className="w-80 flex-shrink-0 bg-[#18181b] border-l border-white/10 flex flex-col overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4 text-white/40" />
          <span className="text-sm font-semibold text-white truncate">
            {themeDef?.label ?? section.type}
          </span>
        </div>
        <button type="button" className="p-1 rounded text-white/40 hover:text-white hover:bg-white/10" onClick={onClose}>
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Data source */}
      <div className="px-4 py-3 border-b border-white/10">
        <p className="text-[10px] text-white/40 uppercase tracking-wider mb-2">Source de données</p>
        <div className="grid grid-cols-2 gap-1">
          {DATA_SOURCES.map((ds) => (
            <button
              key={ds}
              type="button"
              className={cn(
                "text-xs px-2 py-1.5 rounded border transition-colors text-left",
                section.dataSource === ds
                  ? "border-blue-500 bg-blue-600/20 text-blue-300"
                  : "border-white/10 text-white/40 hover:border-white/30 hover:text-white/70"
              )}
              onClick={() => handleDataSourceChange(ds)}
            >
              {DATA_SOURCE_LABELS[ds]}
            </button>
          ))}
        </div>
      </div>

      {/* Animation */}
      <div className="px-4 py-3 border-b border-white/10">
        <p className="text-[10px] text-white/40 uppercase tracking-wider mb-2">Animation d'entrée</p>
        <div className="grid grid-cols-2 gap-1">
          {(Object.keys(ANIMATION_LABELS) as SectionAnimation[]).map((anim) => (
            <button
              key={anim}
              type="button"
              className={cn(
                "text-xs px-2 py-1.5 rounded border transition-colors text-left",
                (section.animation ?? "none") === anim
                  ? "border-purple-500 bg-purple-600/20 text-purple-300"
                  : "border-white/10 text-white/40 hover:border-white/30 hover:text-white/70"
              )}
              onClick={() => handleAnimationChange(anim)}
            >
              {ANIMATION_LABELS[anim]}
            </button>
          ))}
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex border-b border-white/10">
        <button
          type="button"
          className={cn("flex-1 py-2 text-xs font-medium transition-colors", tab === "form" ? "text-white border-b-2 border-blue-500" : "text-white/40 hover:text-white/70")}
          onClick={() => setTab("form")}
        >
          Formulaire
        </button>
        <button
          type="button"
          className={cn("flex-1 py-2 text-xs font-medium transition-colors", tab === "json" ? "text-white border-b-2 border-blue-500" : "text-white/40 hover:text-white/70")}
          onClick={() => setTab("json")}
        >
          JSON
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "form" ? (
          <FormEditor data={section.data} onChange={handleFieldChange} />
        ) : (
          <div className="p-4">
            <textarea
              value={jsonText}
              onChange={(e) => handleJsonChange(e.target.value)}
              className={cn(
                "w-full font-mono text-xs bg-black/40 border rounded-lg p-3 text-white/80 resize-none focus:outline-none focus:ring-1",
                jsonError ? "border-red-500/50 focus:ring-red-500" : "border-white/10 focus:ring-blue-500"
              )}
              rows={28}
              spellCheck={false}
            />
            {jsonError && <p className="text-red-400 text-xs mt-1">{jsonError}</p>}
          </div>
        )}
      </div>

      {themeDef?.description && (
        <div className="border-t border-white/10 px-4 py-3">
          <p className="text-xs text-white/25 italic">{themeDef.description}</p>
        </div>
      )}
    </div>
  );
};

// ─── Smart Form Editor ───────────────────────────────────────────────────────

interface FormEditorProps {
  data: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}

const FormEditor: React.FC<FormEditorProps> = ({ data, onChange }) => {
  const entries = Object.entries(data).filter(([k]) => k !== "settings");
  const settings = data.settings as Record<string, unknown> | undefined;

  return (
    <div className="p-4 space-y-4">
      {entries.map(([key, value]) => (
        <FormField key={key} fieldKey={key} value={value} onChange={onChange} />
      ))}
      {settings && Object.keys(settings).length > 0 && (
        <div className="border-t border-white/10 pt-4">
          <p className="text-[10px] text-white/40 uppercase tracking-wider mb-3">Paramètres</p>
          {Object.entries(settings).map(([key, value]) => (
            <FormField
              key={`settings.${key}`}
              fieldKey={key}
              value={value}
              onChange={(k, v) => onChange("settings", { ...(settings as Record<string, unknown>), [k]: v })}
              compact
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface FormFieldProps {
  fieldKey: string;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
  compact?: boolean;
}

const FIELD_LABELS: Record<string, string> = {
  title: "Titre", subtitle: "Sous-titre", content: "Contenu",
  backgroundImage: "Image de fond (URL)", image: "Image (URL)",
  show: "Visible", overlay: "Overlay sombre", height: "Hauteur",
  columns: "Colonnes", style: "Style", showMap: "Afficher la carte",
  showForm: "Afficher le formulaire", showRating: "Afficher les étoiles",
  postsPerPage: "Articles par page", showExcerpt: "Afficher l'extrait",
  delay: "Délai (ms)", showOnce: "Afficher une seule fois",
  lightbox: "Lightbox", imagePosition: "Position image",
};

function labelForKey(key: string): string {
  return FIELD_LABELS[key] ?? key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
}

const FormField: React.FC<FormFieldProps> = ({ fieldKey, value, onChange, compact }) => {
  if (fieldKey === "cta" && value && typeof value === "object" && !Array.isArray(value)) {
    const cta = value as { text?: string; href?: string };
    return (
      <div className={cn("space-y-2", compact && "mb-3")}>
        <Label className="text-xs text-white/50 uppercase tracking-wider">CTA</Label>
        <div className="space-y-1.5">
          <Input value={cta.text ?? ""} onChange={(e) => onChange(fieldKey, { ...cta, text: e.target.value })} placeholder="Texte du bouton" className="h-8 text-xs bg-black/30 border-white/10 text-white placeholder:text-white/20 focus-visible:ring-blue-500" />
          <Input value={cta.href ?? ""} onChange={(e) => onChange(fieldKey, { ...cta, href: e.target.value })} placeholder="Lien (#contact, /page...)" className="h-8 text-xs bg-black/30 border-white/10 text-white placeholder:text-white/20 focus-visible:ring-blue-500" />
        </div>
      </div>
    );
  }

  if (Array.isArray(value)) {
    return (
      <div className={cn("space-y-1", compact && "mb-3")}>
        <Label className="text-xs text-white/50 uppercase tracking-wider">{labelForKey(fieldKey)}</Label>
        <p className="text-xs text-white/40 italic">{value.length} élément(s) — éditer en JSON</p>
      </div>
    );
  }

  if (typeof value === "boolean") {
    return (
      <div className={cn("flex items-center justify-between", compact && "mb-2")}>
        <Label className="text-xs text-white/60">{labelForKey(fieldKey)}</Label>
        <button
          type="button"
          className={cn("w-10 h-5 rounded-full transition-colors relative", value ? "bg-blue-600" : "bg-white/15")}
          onClick={() => onChange(fieldKey, !value)}
        >
          <span className={cn("absolute top-0.5 h-4 w-4 bg-white rounded-full shadow transition-transform", value ? "translate-x-5 left-0.5" : "translate-x-0 left-0.5")} />
        </button>
      </div>
    );
  }

  if (typeof value === "number") {
    return (
      <div className={cn("space-y-1", compact && "mb-2")}>
        <Label className="text-xs text-white/50">{labelForKey(fieldKey)}</Label>
        <Input type="number" value={value} onChange={(e) => onChange(fieldKey, Number(e.target.value))} className="h-8 text-xs bg-black/30 border-white/10 text-white focus-visible:ring-blue-500" />
      </div>
    );
  }

  if (typeof value === "string") {
    const isLong = fieldKey === "content" || value.length > 80;
    const label = <Label className="text-xs text-white/50 uppercase tracking-wider">{labelForKey(fieldKey)}</Label>;
    if (isLong) {
      return (
        <div className={cn("space-y-1", compact && "mb-2")}>
          {label}
          <textarea value={value} onChange={(e) => onChange(fieldKey, e.target.value)} rows={3} className="w-full text-xs bg-black/30 border border-white/10 rounded-md p-2 text-white/80 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </div>
      );
    }
    return (
      <div className={cn("space-y-1", compact && "mb-2")}>
        {label}
        <Input value={value} onChange={(e) => onChange(fieldKey, e.target.value)} className="h-8 text-xs bg-black/30 border-white/10 text-white placeholder:text-white/20 focus-visible:ring-blue-500" />
      </div>
    );
  }

  if (typeof value === "object" && value !== null) {
    return (
      <div className={cn("space-y-1", compact && "mb-2")}>
        <Label className="text-xs text-white/50 uppercase tracking-wider">{labelForKey(fieldKey)}</Label>
        <p className="text-xs text-white/30 italic">Objet complexe — éditer en JSON</p>
      </div>
    );
  }

  return null;
};

export default SiteConfigEditor;
