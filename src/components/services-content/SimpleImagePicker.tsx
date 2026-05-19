"use client";

import React from "react";
import { ImageIcon, Loader2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { MediaLibraryItem } from "@/types";

interface Props {
  value: string | null | undefined;
  onChange: (url: string | null) => void;
}

/**
 * Compact image picker for forms that aren't part of the site builder
 * section-schema flow: opens a modal that lists the central media library
 * with a search bar, plus a "paste URL" tab. Returns the public_url string.
 */
export function SimpleImagePicker({ value, onChange }: Props) {
  const [open, setOpen] = React.useState(false);
  const [urlInput, setUrlInput] = React.useState(value ?? "");
  const [items, setItems] = React.useState<MediaLibraryItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [search, setSearch] = React.useState("");

  React.useEffect(() => setUrlInput(value ?? ""), [value]);

  const fetchItems = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      params.set("limit", "120");
      const res = await fetch(`/api/media?${params.toString()}`);
      if (res.ok) {
        const data = (await res.json()) as { items: MediaLibraryItem[] };
        setItems(data.items);
      }
    } finally {
      setLoading(false);
    }
  }, [search]);

  React.useEffect(() => {
    if (open) void fetchItems();
  }, [open, fetchItems]);

  return (
    <>
      <div className="flex items-center gap-2">
        {value ? (
          <div className="relative w-24 h-16 rounded-md overflow-hidden border bg-gray-50 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt="" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(null)}
              className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5 hover:bg-black/80"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <div className="w-24 h-16 rounded-md border border-dashed bg-gray-50 flex items-center justify-center shrink-0">
            <ImageIcon className="h-5 w-5 text-gray-400" />
          </div>
        )}
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          {value ? "Changer" : "Choisir une image"}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Choisir une image</DialogTitle>
          </DialogHeader>

          <div className="flex gap-2 items-center">
            <Input
              placeholder="URL d'image directe"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              className="flex-1"
            />
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onChange(urlInput.trim() || null);
                setOpen(false);
              }}
              disabled={!urlInput.trim()}
            >
              Utiliser
            </Button>
          </div>

          <div className="pt-2 border-t">
            <Input
              placeholder="Rechercher dans la bibliothèque"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="mb-3"
            />
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              </div>
            ) : items.length === 0 ? (
              <div className="text-center text-sm text-gray-500 py-10">
                Aucune image trouvée.
              </div>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-96 overflow-y-auto pr-1">
                {items.map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => {
                      onChange(it.public_url);
                      setOpen(false);
                    }}
                    className="relative aspect-video rounded overflow-hidden border hover:ring-2 hover:ring-blue-500"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={it.public_url}
                      alt={it.alt_text ?? ""}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
