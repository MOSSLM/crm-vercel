"use client";

import React from "react";
import { Plus, Settings2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/utils/supabase/client";
import { CALENDAR_PALETTE, DEFAULT_EVENT_COLOR, type CalendarCategory } from "./types";

export interface CategoryLegendProps {
  categories: CalendarCategory[];
  onChanged: () => void;
}

export const CategoryLegend = ({ categories, onChanged }: CategoryLegendProps) => {
  const [newName, setNewName] = React.useState("");
  const [newColor, setNewColor] = React.useState(DEFAULT_EVENT_COLOR);
  const [busy, setBusy] = React.useState(false);

  const addCategory = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    const nextPosition = (categories.at(-1)?.position ?? 0) + 100;
    const { error } = await supabase
      .from("crm_calendar_categories")
      .insert({ nom: newName.trim(), color: newColor, position: nextPosition });
    setBusy(false);
    if (!error) {
      setNewName("");
      setNewColor(DEFAULT_EVENT_COLOR);
      onChanged();
    }
  };

  const updateColor = async (id: string, color: string) => {
    await supabase.from("crm_calendar_categories").update({ color }).eq("id", id);
    onChanged();
  };

  const renameCategory = async (id: string, nom: string) => {
    if (!nom.trim()) return;
    await supabase.from("crm_calendar_categories").update({ nom: nom.trim() }).eq("id", id);
    onChanged();
  };

  const removeCategory = async (id: string) => {
    await supabase.from("crm_calendar_categories").delete().eq("id", id);
    onChanged();
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {categories.map((c) => (
        <span
          key={c.id}
          className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium"
        >
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.color }} />
          {c.nom}
        </span>
      ))}

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            <Settings2 className="mr-2 h-4 w-4" />
            Catégories
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80">
          <div className="space-y-3">
            <p className="text-sm font-semibold">Catégories &amp; couleurs</p>

            <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
              {categories.length === 0 && (
                <p className="text-xs text-muted-foreground">Aucune catégorie pour l&apos;instant.</p>
              )}
              {categories.map((c) => (
                <div key={c.id} className="flex items-center gap-2">
                  <Input
                    type="color"
                    value={c.color}
                    onChange={(e) => updateColor(c.id, e.target.value)}
                    className="h-8 w-9 shrink-0 p-1"
                  />
                  <Input
                    defaultValue={c.nom}
                    onBlur={(e) => {
                      if (e.target.value.trim() && e.target.value.trim() !== c.nom) {
                        renameCategory(c.id, e.target.value);
                      }
                    }}
                    className="h-8 flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeCategory(c.id)}
                    aria-label={`Supprimer ${c.nom}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="space-y-2 border-t pt-3">
              <Label className="text-xs">Nouvelle catégorie</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="color"
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value)}
                  className="h-8 w-9 shrink-0 p-1"
                />
                <Input
                  value={newName}
                  placeholder="Ex. Travail, Réunion…"
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addCategory();
                  }}
                  className="h-8 flex-1"
                />
                <Button size="icon" className="h-8 w-8 shrink-0" onClick={addCategory} disabled={busy}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {CALENDAR_PALETTE.map((p) => (
                  <button
                    key={p.color}
                    type="button"
                    title={p.name}
                    onClick={() => setNewColor(p.color)}
                    className={`h-5 w-5 rounded-full border-2 ${
                      newColor.toLowerCase() === p.color.toLowerCase()
                        ? "border-foreground"
                        : "border-transparent"
                    }`}
                    style={{ backgroundColor: p.color }}
                  />
                ))}
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};
