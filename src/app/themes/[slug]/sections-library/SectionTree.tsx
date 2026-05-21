"use client";

import React from "react";
import { Plus, ChevronRight, ChevronDown, Trash2, Copy, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CATEGORIES, type ThemeSection } from "./types";

interface Props {
  themeSlug: string;
  sections: ThemeSection[];
  activeSectionId: string | null;
  onSelect: (section: ThemeSection) => void;
  onRefresh: () => void;
  unsavedId: string | null;
}

export default function SectionTree({
  themeSlug,
  sections,
  activeSectionId,
  onSelect,
  onRefresh,
  unsavedId,
}: Props) {
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});
  const [createOpen, setCreateOpen] = React.useState(false);
  const [renameOpen, setRenameOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<ThemeSection | null>(null);
  const [renameTarget, setRenameTarget] = React.useState<ThemeSection | null>(null);
  const [newId, setNewId] = React.useState("");
  const [newName, setNewName] = React.useState("");
  const [newCategory, setNewCategory] = React.useState("layouts");
  const [newIsTagAdaptive, setNewIsTagAdaptive] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const grouped = React.useMemo(() => {
    const map: Record<string, ThemeSection[]> = {};
    for (const s of sections) {
      if (!map[s.category]) map[s.category] = [];
      map[s.category].push(s);
    }
    return map;
  }, [sections]);

  const sortedCategories = CATEGORIES.filter((c) => grouped[c.id]?.length > 0).concat(
    Object.keys(grouped)
      .filter((k) => !CATEGORIES.find((c) => c.id === k))
      .map((k) => ({ id: k, label: k }))
  );

  const toggleCategory = (id: string) =>
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));

  const handleCreate = async () => {
    if (!newId.trim() || !newName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/themes/${themeSlug}/sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section_id: newId.trim().toLowerCase().replace(/\s+/g, "-"),
          category: newCategory,
          name: newName.trim(),
          is_tag_adaptive: newIsTagAdaptive,
        }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error);
      }
      const created: ThemeSection = await res.json();
      toast.success(`Section "${created.section_id}" créée`);
      setCreateOpen(false);
      setNewId("");
      setNewName("");
      setNewIsTagAdaptive(false);
      onRefresh();
      onSelect(created);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = async (section: ThemeSection) => {
    const newSectionId = `${section.section_id}_copy`;
    try {
      const res = await fetch(`/api/themes/${themeSlug}/sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section_id: newSectionId,
          category: section.category,
          name: `${section.name} (copie)`,
          code: section.code,
          example_data: section.example_data,
        }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error);
      }
      const dup: ThemeSection = await res.json();
      toast.success(`Section dupliquée`);
      onRefresh();
      onSelect(dup);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(
        `/api/themes/${themeSlug}/sections/${deleteTarget.section_id}`,
        { method: "DELETE" }
      );
      if (!res.ok && res.status !== 204) throw new Error("Erreur de suppression");
      toast.success(`Section "${deleteTarget.section_id}" supprimée`);
      setDeleteTarget(null);
      onRefresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  };

  const handleRename = async () => {
    if (!renameTarget || !newName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/themes/${themeSlug}/sections/${renameTarget.section_id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newName.trim() }),
        }
      );
      if (!res.ok) throw new Error("Erreur");
      toast.success("Section renommée");
      setRenameOpen(false);
      onRefresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
          Sections
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-zinc-400 hover:text-white"
          onClick={() => setCreateOpen(true)}
          title="Nouvelle section"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="py-1">
          {sortedCategories.length === 0 && (
            <div className="px-4 py-8 text-center text-zinc-600 text-xs">
              Aucune section.
              <br />
              Cliquez sur + pour créer.
            </div>
          )}

          {sortedCategories.map((cat) => {
            const items = grouped[cat.id] ?? [];
            const isCollapsed = collapsed[cat.id];
            return (
              <div key={cat.id}>
                <button
                  className="flex items-center gap-1 w-full px-3 py-1 text-xs font-medium text-zinc-500 hover:text-zinc-300 transition-colors"
                  onClick={() => toggleCategory(cat.id)}
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-3 w-3 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="h-3 w-3 flex-shrink-0" />
                  )}
                  <span className="uppercase tracking-wider">{cat.label}</span>
                  <Badge
                    variant="secondary"
                    className="ml-auto text-[10px] h-4 px-1 bg-zinc-800 text-zinc-500"
                  >
                    {items.length}
                  </Badge>
                </button>

                {!isCollapsed &&
                  items.map((section) => (
                    <SectionItem
                      key={section.section_id}
                      section={section}
                      active={activeSectionId === section.section_id}
                      unsaved={unsavedId === section.section_id}
                      onSelect={() => onSelect(section)}
                      onDuplicate={() => handleDuplicate(section)}
                      onRename={() => {
                        setRenameTarget(section);
                        setNewName(section.name);
                        setRenameOpen(true);
                      }}
                      onDelete={() => setDeleteTarget(section)}
                    />
                  ))}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white">
          <DialogHeader>
            <DialogTitle>Nouvelle section</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-zinc-300">Identifiant (ex: header2)</Label>
              <Input
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
                placeholder="header2"
                className="bg-zinc-800 border-zinc-700 text-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-300">Nom</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="En-tête avec logo centré"
                className="bg-zinc-800 border-zinc-700 text-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-300">Catégorie</Label>
              <Select value={newCategory} onValueChange={setNewCategory}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-start gap-2.5 rounded-md border border-zinc-700 bg-zinc-800/50 p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={newIsTagAdaptive}
                onChange={(e) => setNewIsTagAdaptive(e.target.checked)}
                className="mt-0.5 accent-blue-500"
              />
              <span className="text-sm">
                <span className="text-zinc-200 font-medium">Section adaptative aux services</span>
                <span className="block text-xs text-zinc-400 mt-0.5">
                  La section répète un élément (carte, item…) une fois par service de l&apos;entreprise.
                  Code et schéma de départ adaptés.
                </span>
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setCreateOpen(false)}
              className="text-zinc-400"
            >
              Annuler
            </Button>
            <Button
              onClick={handleCreate}
              disabled={saving || !newId || !newName}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {saving ? "Création…" : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white">
          <DialogHeader>
            <DialogTitle>Renommer la section</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="bg-zinc-800 border-zinc-700 text-white"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameOpen(false)} className="text-zinc-400">
              Annuler
            </Button>
            <Button
              onClick={handleRename}
              disabled={saving || !newName}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {saving ? "Enregistrement…" : "Renommer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-800 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer la section ?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Cette action est irréversible. La section{" "}
              <span className="font-mono text-red-400">{deleteTarget?.section_id}</span> sera
              définitivement supprimée.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700">
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SectionItem({
  section,
  active,
  unsaved,
  onSelect,
  onDuplicate,
  onRename,
  onDelete,
}: {
  section: ThemeSection;
  active: boolean;
  unsaved: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const [hover, setHover] = React.useState(false);

  return (
    <div
      className={`group flex items-center gap-1.5 pl-6 pr-2 py-1 cursor-pointer transition-colors ${
        active ? "bg-blue-600/20 text-blue-300" : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
      }`}
      onClick={onSelect}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={section.name}
    >
      <span className="font-mono text-xs flex-1 truncate">
        {section.section_id}
      </span>
      {unsaved && (
        <span className="h-1.5 w-1.5 rounded-full bg-orange-400 flex-shrink-0" title="Non sauvegardé" />
      )}
      {hover && (
        <div className="flex items-center gap-0.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            className="p-0.5 rounded hover:text-white"
            onClick={onRename}
            title="Renommer"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            className="p-0.5 rounded hover:text-white"
            onClick={onDuplicate}
            title="Dupliquer"
          >
            <Copy className="h-3 w-3" />
          </button>
          <button
            className="p-0.5 rounded hover:text-red-400"
            onClick={onDelete}
            title="Supprimer"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}
